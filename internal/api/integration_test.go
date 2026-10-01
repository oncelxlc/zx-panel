package api

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
	"zx-panel/internal/config"
	"zx-panel/internal/control"
	"zx-panel/internal/storage"
)

// integrationDatabase 创建随机命名的隔离数据库，不迁移用户的业务数据库。
// 只有明确设置 ZX_PANEL_INTEGRATION=1 才执行，清理仅允许本函数生成的名称。
func integrationDatabase(t *testing.T, prepare ...func(*storage.Postgres)) (*storage.Postgres, config.PanelConfig) {
	t.Helper()
	if os.Getenv("ZX_PANEL_INTEGRATION") != "1" {
		t.Skip("set ZX_PANEL_INTEGRATION=1 to create an isolated PostgreSQL test database")
	}
	if err := godotenv.Load("../../.env"); err != nil && !os.IsNotExist(err) {
		t.Fatal("cannot load local database configuration")
	}
	legacy, err := config.LoadServerConfig()
	if err != nil {
		t.Fatal("invalid database test configuration")
	}
	source, err := pgx.ParseConfig(legacy.DatabaseURL)
	if err != nil {
		t.Fatal("invalid database URL")
	}
	ctx := context.Background()
	admin, err := pgx.ConnectConfig(ctx, source)
	if err != nil {
		t.Fatal("PostgreSQL test administrator connection unavailable")
	}
	suffix, err := control.ID()
	if err != nil {
		t.Fatal(err)
	}
	name := "zx_panel_test_" + suffix
	quoted := pgx.Identifier{name}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+quoted); err != nil {
		admin.Close(ctx)
		t.Fatalf("cannot create isolated test database: %v", err)
	}
	t.Cleanup(func() {
		if !strings.HasPrefix(name, "zx_panel_test_") || len(name) != 46 {
			t.Error("refusing unsafe database cleanup")
			return
		}
		if _, err := admin.Exec(ctx, "DROP DATABASE "+quoted+" WITH (FORCE)"); err != nil {
			t.Errorf("isolated database cleanup failed: %v", err)
		}
		admin.Close(ctx)
	})
	target, err := url.Parse(legacy.DatabaseURL)
	if err != nil {
		t.Fatal("invalid isolation URL")
	}
	target.Path = "/" + name
	target.RawPath = ""
	query := target.Query()
	query.Del("dbname")
	query.Del("database")
	target.RawQuery = query.Encode()
	database, err := storage.OpenPostgres(ctx, target.String())
	if err != nil {
		t.Fatal("isolated test database connection failed")
	}
	t.Cleanup(database.Close)
	var actual string
	if err = database.Pool().QueryRow(ctx, "SELECT current_database()").Scan(&actual); err != nil || actual != name || actual == source.Database {
		t.Fatal("ISOLATION CHECK FAILED: refusing all test writes")
	}
	for _, seed := range prepare {
		seed(database)
	}
	lock, err := database.AcquireInstanceLock(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err = database.MigratePanel(ctx); err != nil {
		storage.ReleaseInstanceLock(lock)
		t.Fatal(err)
	}
	storage.ReleaseInstanceLock(lock)
	cfg := config.DefaultPanelConfig()
	cfg.DatabaseURL = target.String()
	base := t.TempDir()
	cfg.Paths = config.Paths{DataRoot: filepath.Join(base, "data"), RuntimeRoot: filepath.Join(base, "runtimes"), StagingRoot: filepath.Join(base, "staging"), ArtifactCacheRoot: filepath.Join(base, "cache"), ExportRoot: filepath.Join(base, "exports"), AppRoots: []string{filepath.Join(base, "apps")}, SecretKeyFile: filepath.Join(base, "keys", "app.key")}
	for _, path := range []string{cfg.Paths.DataRoot, cfg.Paths.RuntimeRoot, cfg.Paths.StagingRoot, cfg.Paths.ExportRoot, cfg.Paths.ArtifactCacheRoot, cfg.Paths.AppRoots[0]} {
		if err = os.MkdirAll(path, 0700); err != nil {
			t.Fatal(err)
		}
	}
	return database, cfg
}

// TestPostgresCookieAndDurableTasks 覆盖真实迁移、Cookie/CSRF、秘密边界和并发幂等。
// 全部写入隔离数据库，禁止测试真实主机安装或 systemd 生命周期。
func TestPostgresCookieAndDurableTasks(t *testing.T) {
	database, cfg := integrationDatabase(t)
	ctx := context.Background()
	vault, err := control.OpenVault(cfg.Paths.SecretKeyFile, true)
	if err != nil {
		t.Fatal(err)
	}
	service, err := control.NewService(cfg, database.Pool(), vault, "test")
	if err != nil {
		t.Fatal(err)
	}
	router, err := NewPanelRouter(cfg, database, service, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err = assertAPIContract(router); err != nil {
		t.Fatal(err)
	}
	call := func(method, path, body, csrf string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, "http://localhost:7200/api/v1"+path, strings.NewReader(body))
		if method != "GET" {
			request.Header.Set("Origin", cfg.HTTP.PublicOrigin)
			request.Header.Set("Content-Type", "application/json")
		}
		if csrf != "" {
			request.Header.Set("X-CSRF-Token", csrf)
		}
		for _, cookie := range cookies {
			request.AddCookie(cookie)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	var session struct {
		Data struct {
			CSRFToken string `json:"csrfToken"`
		} `json:"data"`
	}
	response := call("GET", "/auth/session", "", "")
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &session) != nil || session.Data.CSRFToken == "" {
		t.Fatalf("anonymous handshake: %d %s", response.Code, response.Body.String())
	}
	preauth := response.Result().Cookies()[0]
	if !preauth.HttpOnly || preauth.Path != "/" || preauth.SameSite != http.SameSiteStrictMode {
		t.Fatal("unsafe prelogin cookie")
	}
	token := "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	digest := sha256.Sum256([]byte(token))
	if err = database.SaveSetupToken(ctx, digest[:]); err != nil {
		t.Fatal(err)
	}
	password := " Password; $(literal) 123 "
	body, _ := json.Marshal(map[string]string{"token": token, "username": "owner", "password": password})
	if got := call("POST", "/auth/setup", string(body), "", preauth); got.Code != 403 {
		t.Fatalf("missing CSRF accepted: %d", got.Code)
	}
	if got := call("POST", "/auth/setup", string(body), session.Data.CSRFToken, preauth); got.Code != 201 {
		t.Fatalf("setup failed %d %s", got.Code, got.Body.String())
	}
	response = call("GET", "/auth/session", "", "")
	if err = json.Unmarshal(response.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	preauth = response.Result().Cookies()[0]
	if got := call("POST", "/auth/setup", string(body), session.Data.CSRFToken, preauth); got.Code != 403 {
		t.Fatalf("setup replay accepted: %d", got.Code)
	}
	loginBody, _ := json.Marshal(map[string]string{"username": "owner", "password": password})
	response = call("POST", "/auth/login", string(loginBody), session.Data.CSRFToken, preauth)
	if response.Code != 200 {
		t.Fatalf("login failed %d %s", response.Code, response.Body.String())
	}
	if bytes.Contains(response.Body.Bytes(), []byte(`"token"`)) || bytes.Contains(response.Body.Bytes(), []byte(password)) {
		t.Fatal("authentication secret leaked")
	}
	var authenticated struct {
		Data struct {
			CSRFToken string `json:"csrfToken"`
			User      struct {
				ID int64 `json:"id"`
			} `json:"user"`
		} `json:"data"`
	}
	if err = json.Unmarshal(response.Body.Bytes(), &authenticated); err != nil {
		t.Fatal(err)
	}
	var cookie *http.Cookie
	for _, candidate := range response.Result().Cookies() {
		if candidate.Name == "zx-panel-session" {
			cookie = candidate
		}
	}
	if cookie == nil || !cookie.HttpOnly {
		t.Fatal("session cookie missing")
	}
	csrf := authenticated.Data.CSRFToken
	actor := authenticated.Data.User.ID
	if csrf == session.Data.CSRFToken {
		t.Fatal("CSRF did not rotate")
	}
	for _, test := range []struct {
		path, body string
		status     int
	}{{"/settings", `{"displayTimezone":"server","displayTimezone":"browser"}`, 400}, {"/settings", `{"ExpectedRevision":"1"}`, 422}, {"/settings", `{} {}`, 400}, {"/tasks/missing/cancel", `{"remoteHost":"example.com"}`, 422}} {
		method := "PATCH"
		if strings.Contains(test.path, "/cancel") {
			method = "POST"
		}
		got := call(method, test.path, test.body, csrf, cookie)
		if got.Code != test.status {
			t.Errorf("strict boundary %s: %d != %d", test.body, got.Code, test.status)
		}
	}
	if got := call("GET", "/bootstrap", "", "", cookie); got.Code != 200 {
		t.Errorf("bootstrap: %d %s", got.Code, got.Body.String())
	}
	for _, check := range []struct {
		path   string
		status int
	}{
		{"/runtimes/rust/installations", 200},
		{"/runtimes/python/installations", 200},
		{"/runtimes/unknown/installations", 404},
		{"/runtimes/rust/releases", 404},
	} {
		if got := call("GET", check.path, "", "", cookie); got.Code != check.status {
			t.Errorf("runtime read boundary %s: %d != %d", check.path, got.Code, check.status)
		}
	}
	if os.Getenv("ZX_PANEL_CONTRACT_FIXTURES") == "1" {
		fixtures := map[string]json.RawMessage{}
		for schema, path := range map[string]string{"Bootstrap": "/bootstrap", "SystemInfo": "/system/info", "Capabilities": "/system/capabilities", "MetricSnapshot": "/metrics/latest", "Settings": "/settings", "RuntimeSummaries": "/runtimes", "InstallationPage": "/runtimes/node/installations", "ApplicationPage": "/apps", "TaskPage": "/tasks"} {
			response := call("GET", path, "", "", cookie)
			if response.Code != 200 {
				t.Fatalf("fixture %s status %d", schema, response.Code)
			}
			fixtures[schema] = json.RawMessage(response.Body.Bytes())
		}
		body, err := json.MarshalIndent(fixtures, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.MkdirAll("../../test-results", 0700); err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile("../../test-results/go-api.json", body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest("GET", "http://evil.invalid/api/v1/bootstrap", nil)
	request.AddCookie(cookie)
	rebound := httptest.NewRecorder()
	router.ServeHTTP(rebound, request)
	if rebound.Code != 403 {
		t.Fatal("forged Host accepted")
	}
	bearer := httptest.NewRequest("GET", "http://localhost:7200/api/v1/bootstrap", nil)
	bearer.Header.Set("Authorization", "Bearer "+cookie.Value)
	legacyResponse := httptest.NewRecorder()
	router.ServeHTTP(legacyResponse, bearer)
	if legacyResponse.Code != 401 {
		t.Fatal("legacy Bearer authenticated")
	}
	from := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	work := control.Work{Operation: control.Operation{Action: "logs.export"}, Logs: &control.LogFilter{SourceID: "panel", Level: "all", From: from}}
	key := "parallel-identical-request-0001"
	var wg sync.WaitGroup
	ids := make(chan string, 24)
	failures := make(chan error, 24)
	for i := 0; i < 24; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task, err := service.SubmitSimple(ctx, actor, key, work)
			if err != nil {
				failures <- err
				return
			}
			ids <- task.ID
		}()
	}
	wg.Wait()
	close(ids)
	close(failures)
	for err := range failures {
		t.Error(err)
	}
	unique := map[string]bool{}
	var taskID string
	for id := range ids {
		unique[id] = true
		taskID = id
	}
	if len(unique) != 1 {
		t.Fatalf("created %d tasks for one key", len(unique))
	}
	other := work
	other.Kind = "changed"
	if _, err = service.SubmitSimple(ctx, actor, key, other); err == nil {
		t.Fatal("idempotency conflict not rejected")
	}
	var count int
	if err = database.Pool().QueryRow(ctx, "SELECT count(*) FROM app.tasks").Scan(&count); err != nil || count != 1 {
		t.Fatalf("task count=%d error=%v", count, err)
	}
	var encrypted []byte
	if err = database.Pool().QueryRow(ctx, "SELECT ciphertext FROM app.task_inputs WHERE task_id=$1", taskID).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(encrypted, []byte("logs.export")) {
		t.Fatal("task input stored in plaintext")
	}
	var outbox int
	if err = database.Pool().QueryRow(ctx, "SELECT count(*) FROM app.event_outbox").Scan(&outbox); err != nil || outbox != 1 {
		t.Fatal("outbox not atomically recorded")
	}
	if _, err = database.Pool().Exec(ctx, `CREATE FUNCTION app.reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON app.audit_events FOR EACH ROW EXECUTE FUNCTION app.reject_audit()`); err != nil {
		t.Fatal(err)
	}
	if _, err = service.SubmitSimple(ctx, actor, "rollback-test-request-0001", work); err == nil {
		t.Fatal("forced transaction failure accepted")
	}
	if _, err = database.Pool().Exec(ctx, "DROP TRIGGER reject_audit ON app.audit_events; DROP FUNCTION app.reject_audit()"); err != nil {
		t.Fatal(err)
	}
	if err = database.Pool().QueryRow(ctx, "SELECT count(*) FROM app.tasks").Scan(&count); err != nil || count != 1 {
		t.Fatal("partial task persisted after rollback")
	}
	cancelTask, err := service.SubmitSimple(ctx, actor, "cancel-queued-request-0001", work)
	if err != nil {
		t.Fatal(err)
	}
	if canceled, e := service.CancelTask(ctx, actor, cancelTask.ID); e != nil || canceled.Status != "canceled" {
		t.Fatal("queued cancellation failed", e)
	}
	interrupted, err := service.SubmitSimple(ctx, actor, "recover-running-request-0001", work)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = database.Pool().Exec(ctx, `UPDATE app.tasks SET status='running',payload=jsonb_set(payload,'{status}','"running"') WHERE id=$1`, interrupted.ID); err != nil {
		t.Fatal(err)
	}
	if err = service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if recovered, e := service.Repo.Task(ctx, interrupted.ID, actor); e != nil || recovered.Status != "interrupted" {
		t.Fatal("unproven task replayed after restart", e)
	}
	t.Cleanup(service.Close)
	deadline := time.Now().Add(8 * time.Second)
	for {
		task, err := service.Repo.Task(ctx, taskID, actor)
		if err != nil {
			t.Fatal(err)
		}
		if task.Status == "succeeded" {
			if task.Result["exportId"] != taskID {
				t.Fatal("export missing result")
			}
			break
		}
		if task.Status == "failed" || task.Status == "interrupted" {
			t.Fatalf("export task failed: %+v", task.Error)
		}
		if time.Now().After(deadline) {
			t.Fatal("durable worker did not execute queued task")
		}
		time.Sleep(20 * time.Millisecond)
	}
	download := call("GET", "/logs/exports/"+taskID+"/download", "", "", cookie)
	if download.Code != 200 {
		t.Fatalf("authorized export download: %d", download.Code)
	}
	streamServer := httptest.NewServer(router)
	defer streamServer.Close()
	streamRequest, err := http.NewRequest("GET", streamServer.URL+"/api/v1/events", nil)
	if err != nil {
		t.Fatal(err)
	}
	streamRequest.Host = "localhost:7200"
	streamRequest.AddCookie(cookie)
	streamClient := &http.Client{Timeout: 8 * time.Second}
	streamResponse, err := streamClient.Do(streamRequest)
	if err != nil {
		t.Fatalf("real HTTP SSE connection failed: %v", err)
	}
	defer streamResponse.Body.Close()
	if streamResponse.StatusCode != 200 || !strings.HasPrefix(streamResponse.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatal("invalid SSE response")
	}
	scanner := bufio.NewScanner(streamResponse.Body)
	seenFrame := false
	for scanner.Scan() {
		if strings.HasPrefix(scanner.Text(), "data: ") {
			seenFrame = true
			break
		}
	}
	if !seenFrame {
		t.Fatalf("no real SSE frame: %v", scanner.Err())
	}
	if got := call("POST", "/auth/logout", "{}", csrf, cookie); got.Code != 200 {
		t.Fatal("logout failed")
	}
	streamClosed := make(chan struct{})
	go func() {
		for scanner.Scan() {
		}
		close(streamClosed)
	}()
	select {
	case <-streamClosed:
	case <-time.After(2 * time.Second):
		t.Fatal("revoked SSE did not close promptly")
	}
	if got := call("GET", "/bootstrap", "", "", cookie); got.Code != 401 {
		t.Fatal("revoked cookie still authenticated")
	}
	if err = database.CheckSchema(ctx); err != nil {
		t.Fatal(err)
	}
	t.Log(fmt.Sprintf("isolated PostgreSQL: auth, strict input, 24-way idempotency, outbox, worker/export, session revocation passed"))
}

// TestRetentionAndExternalObservation 验证游标保留边界与失去证据的外部安装状态。
// 仅删除随机隔离库中的测试日志，不修改主机运行时或用户数据库。
func TestRetentionAndExternalObservation(t *testing.T) {
	database, cfg := integrationDatabase(t)
	ctx := context.Background()
	vault, err := control.OpenVault(cfg.Paths.SecretKeyFile, true)
	if err != nil {
		t.Fatal(err)
	}
	service, err := control.NewService(cfg, database.Pool(), vault, "test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(service.Close)
	if _, err = database.Pool().Exec(ctx, "INSERT INTO app.panel_logs(level,message) VALUES('info','first'),('info','second')"); err != nil {
		t.Fatal(err)
	}
	filter := control.LogFilter{SourceID: "panel", Level: "all", From: time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)}
	page, err := service.Logs(ctx, 1, filter, "", 1)
	if err != nil || page.TailCursor == nil || page.NextCursor == nil || len(page.Items) != 1 {
		t.Fatalf("log anchors missing: %v", err)
	}
	if _, err = service.TailLogs(ctx, 1, filter, *page.TailCursor); err != nil {
		t.Fatal("retained anchor rejected", err)
	}
	if _, err = database.Pool().Exec(ctx, "DELETE FROM app.panel_logs WHERE id=$1::text::bigint", page.Items[0].ID); err != nil {
		t.Fatal(err)
	}
	_, tailErr := service.TailLogs(ctx, 1, filter, *page.TailCursor)
	_, historyErr := service.Logs(ctx, 1, filter, *page.NextCursor, 1)
	for _, result := range []error{tailErr, historyErr} {
		var fault *control.Fault
		if !errors.As(result, &fault) || fault.Code != "CURSOR_EXPIRED" {
			t.Fatalf("removed anchor silently accepted: %v", result)
		}
	}
	missingID := "11111111111111111111111111111111"
	missing := control.Installation{ID: missingID, Kind: "node", Version: "22.0.0", Path: filepath.Join(t.TempDir(), "missing-node"), Ownership: "external", State: "ready", Revision: "1"}
	body, err := json.Marshal(missing)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = database.Pool().Exec(ctx, "INSERT INTO app.runtime_installations(id,kind,path,payload) VALUES($1,$2,$3,$4)", missing.ID, missing.Kind, missing.Path, body); err != nil {
		t.Fatal(err)
	}
	if err = service.DiscoverExternal(ctx); err != nil {
		t.Fatal(err)
	}
	var state string
	if err = database.Pool().QueryRow(ctx, "SELECT payload->>'state' FROM app.runtime_installations WHERE id=$1", missingID).Scan(&state); err != nil || state != "unknown" {
		t.Fatalf("missing external runtime still ready: %s %v", state, err)
	}
	if runtime.GOOS != "linux" {
		return
	}
	// 在随机隔离数据库与临时 PATH 中核实新增类别，绝不修改主机安装。
	directory := t.TempDir()
	rustPath := filepath.Join(directory, "rustc")
	if err = os.WriteFile(rustPath, []byte("#!/bin/sh\nprintf 'rustc 1.90.0 (test)\\n'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", directory+string(os.PathListSeparator)+os.Getenv("PATH"))
	if err = service.DiscoverExternal(ctx); err != nil {
		t.Fatal(err)
	}
	items, err := service.Repo.Installations(ctx, "rust")
	if err != nil {
		t.Fatal(err)
	}
	var detected *control.Installation
	for i := range items {
		if items[i].Path == rustPath {
			detected = &items[i]
		}
	}
	if detected == nil || detected.Version != "1.90.0" || detected.State != "ready" || detected.Ownership != "external" {
		t.Fatal("Rust installation was not persisted", detected)
	}
	summaries, err := service.RuntimeSummaries(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, summary := range summaries {
		if summary.Kind == "rust" {
			found = summary.ExternalCount > 0 && len(summary.ExternalVersions) > 0 && summary.PanelCount == 0 && summary.DefaultVersion == nil && summary.CacheState == "unavailable"
		}
	}
	if !found {
		t.Fatal("read-only Rust summary missing", summaries)
	}
	if err = service.DiscoverExternal(ctx); err != nil {
		t.Fatal(err)
	}
	var revision string
	if err = database.Pool().QueryRow(ctx, "SELECT revision::text FROM app.runtime_installations WHERE id=$1", detected.ID).Scan(&revision); err != nil || revision != detected.Revision {
		t.Fatal("unchanged installation revision changed", revision, err)
	}
	if err = os.Remove(rustPath); err != nil {
		t.Fatal(err)
	}
	if err = service.DiscoverExternal(ctx); err != nil {
		t.Fatal(err)
	}
	if err = database.Pool().QueryRow(ctx, "SELECT payload->>'state' FROM app.runtime_installations WHERE id=$1", detected.ID).Scan(&state); err != nil || state != "unknown" {
		t.Fatal("removed Rust installation still ready", state, err)
	}
}
