//go:build linux

package api

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"zx-panel/internal/control"
	"zx-panel/internal/host"
)

// TestExternalRuntimePlans 验证外部安装的管理预检、目标指纹绑定和被拒计划不可复用。
// 仅写随机隔离数据库，临时 Unix helper 只返回固定事实，禁止任何系统变更。
func TestExternalRuntimePlans(t *testing.T) {
	database, cfg := integrationDatabase(t)
	ctx := context.Background()
	socket := filepath.Join(t.TempDir(), "helper.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	var changed, dependent atomic.Bool
	go func() {
		for {
			connection, err := listener.Accept()
			if err != nil {
				return
			}
			var request host.Request
			if json.NewDecoder(connection).Decode(&request) == nil {
				result := host.Result{OK: true, ProtocolVersion: host.ProtocolVersion}
				switch request.Action {
				case "probe":
				case "runtime.target", "runtime.target-references":
					fingerprint := "original"
					if changed.Load() {
						fingerprint = "changed"
					}
					result.Runtime = &host.RuntimeTarget{Manager: "apt", Package: "nodejs", PackageVersion: "22.0.0", Executable: request.Executable, Root: request.Executable, Fingerprint: fingerprint}
					if dependent.Load() {
						result.Runtime.RemovalBlocked = "存在其他软件包依赖"
					}
					refs := 0
					result.References, result.Complete = &refs, true
				default:
					result.OK, result.Code = false, "TEST_FORBIDS_MUTATIONS"
				}
				_ = json.NewEncoder(connection).Encode(result)
			}
			connection.Close()
		}
	}()
	cfg.Helper.Enabled, cfg.Helper.SocketPath, cfg.Helper.PanelUID = true, socket, os.Getuid()
	cfg.Helper.ServiceAccounts = []string{"zx-app"}
	vault, err := control.OpenVault(cfg.Paths.SecretKeyFile, true)
	if err != nil {
		t.Fatal(err)
	}
	service, err := control.NewService(cfg, database.Pool(), vault, "test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(service.Close)
	if !service.Capabilities(ctx).InstallRuntime.Enabled {
		t.Skip("runtime management requires a systemd host")
	}
	var actor int64
	if err := database.Pool().QueryRow(ctx, "INSERT INTO app.users(username,password_hash,role) VALUES('runtime-owner','unused-test-hash','admin') RETURNING id").Scan(&actor); err != nil {
		t.Fatal(err)
	}
	item := control.Installation{ID: strings.Repeat("a", 32), Kind: "node", Version: "22.0.0", Path: filepath.Join(t.TempDir(), "node"), Ownership: "external", State: "ready", Revision: "1"}
	body, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Pool().Exec(ctx, "INSERT INTO app.runtime_installations(id,kind,path,payload) VALUES($1,$2,$3,$4)", item.ID, item.Kind, item.Path, body); err != nil {
		t.Fatal(err)
	}
	op := control.Operation{Action: "runtime.set-system-default", InstallationID: item.ID, ExpectedRevision: "1"}
	// 系统入口属于宿主；只核实冲突拒绝，不为测试覆盖已有 Node.js。
	entryInfo, entryErr := os.Lstat("/usr/local/bin/node")
	if entryErr != nil && !os.IsNotExist(entryErr) {
		t.Fatal(entryErr)
	}
	plan, err := service.Preview(ctx, actor, op)
	if err != nil || plan.ConfirmationText == nil || *plan.ConfirmationText != item.Version {
		t.Fatalf("system default preview: %#v %v", plan, err)
	}
	var fault *control.Fault
	if entryErr == nil && entryInfo.Mode()&os.ModeSymlink == 0 {
		if plan.CanExecute || len(plan.BlockedReasons) != 1 || plan.BlockedReasons[0].Code != "SYSTEM_ENTRY_CONFLICT" {
			t.Fatalf("existing system entry was not protected: %#v", plan)
		}
		_, err = service.Accept(ctx, actor, "runtime-system-entry-conflict", control.Acceptance{PlanID: plan.ID, ConfirmationText: plan.ConfirmationText})
		if !errors.As(err, &fault) || fault.Code != "PLAN_BLOCKED" {
			t.Fatal("conflicting system entry plan accepted", err)
		}
	} else if !plan.CanExecute {
		t.Fatalf("available system entry blocked: %#v", plan)
	}
	// 外部目标指纹检查共用面板默认路径，避免依赖宿主系统入口能否切换。
	op.Action = "runtime.set-default"
	plan, err = service.Preview(ctx, actor, op)
	if err != nil || !plan.CanExecute {
		t.Fatalf("external panel default blocked: %#v %v", plan, err)
	}
	changed.Store(true)
	_, err = service.Accept(ctx, actor, "runtime-target-changed", control.Acceptance{PlanID: plan.ID, ConfirmationText: plan.ConfirmationText})
	if !errors.As(err, &fault) || fault.Code != "REVISION_CONFLICT" {
		t.Fatal("changed target accepted", err)
	}
	changed.Store(false)
	plan, err = service.Preview(ctx, actor, op)
	if err != nil || !plan.CanExecute {
		t.Fatalf("external panel default blocked: %#v %v", plan, err)
	}
	task, err := service.Accept(ctx, actor, "runtime-panel-default", control.Acceptance{PlanID: plan.ID})
	if err != nil || task.Status != "queued" {
		t.Fatal("external default was not accepted", task, err)
	}
	var sealed []byte
	if err := database.Pool().QueryRow(ctx, "SELECT ciphertext FROM app.task_inputs WHERE task_id=$1", task.ID).Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	plain, err := vault.Open("task:"+task.ID, sealed)
	if err != nil {
		t.Fatal(err)
	}
	var work control.Work
	if err := json.Unmarshal(plain, &work); err != nil || work.Runtime == nil || work.Runtime.Fingerprint != "original" {
		t.Fatal("task lost approved target fingerprint", err)
	}
	op.Action = "runtime.uninstall"
	dependent.Store(true)
	plan, err = service.Preview(ctx, actor, op)
	if err != nil || plan.CanExecute {
		t.Fatalf("package dependency did not block removal: %#v %v", plan, err)
	}
	dependent.Store(false)
	_, err = service.Accept(ctx, actor, "runtime-blocked-plan", control.Acceptance{PlanID: plan.ID, ConfirmationText: plan.ConfirmationText})
	if !errors.As(err, &fault) || fault.Code != "PLAN_BLOCKED" {
		t.Fatal("previously denied plan reused", err)
	}
	entry := filepath.Join(cfg.Paths.AppRoots[0], "main.js")
	if err := os.WriteFile(entry, []byte("console.log('fixture')"), 0600); err != nil {
		t.Fatal(err)
	}
	plan, err = service.Preview(ctx, actor, control.Operation{Action: "app.create", App: &control.AppDraft{Name: "external-node-app", WorkingDirectory: cfg.Paths.AppRoots[0], RunAsUser: "zx-app", RestartPolicy: "no", Execution: control.Execution{Kind: "node", RuntimeInstallationID: item.ID, EntryFile: "main.js", Args: []string{}}}})
	if err != nil || !plan.CanExecute {
		t.Fatalf("external application binding blocked: %#v %v", plan, err)
	}
}
