package control

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
	"zx-panel/internal/host"
)

// LogFilter 只接受登记来源和文本筛选，不允许任意文件路径。
// From 与 To 保留原字符串以便续传游标绑定同一筛选。
type LogFilter struct {
	SourceID string `json:"sourceId"`
	Level    string `json:"level"`
	Search   string `json:"search"`
	From     string `json:"from"`
	To       string `json:"to"`
}

// LogSource 公开来源标签与可用操作，不公开磁盘路径。
// 已删除应用日志仍由系统 journal 保留但不新增来源登记。
type LogSource struct {
	ID           string `json:"id"`
	Label        string `json:"label"`
	Capabilities struct {
		Stream bool `json:"stream"`
		Export bool `json:"export"`
	} `json:"capabilities"`
}

// LogPage 分别提供历史翻页和最新续传游标。
// 两种游标不可相互替用。
type LogPage struct {
	Page[LogRecord]
	TailCursor *string `json:"tailCursor"`
}

// LogBatch 是单次有限流批次，超限或丢失必须明确报告。
// Cursor 在同一来源内续接，不含认证秘密。
type LogBatch struct {
	SourceID     string      `json:"sourceId"`
	Records      []LogRecord `json:"records"`
	Cursor       string      `json:"cursor"`
	DroppedCount int         `json:"droppedCount"`
}

// logCursor 将来源筛选、主体、方向和位置绑定到受签名游标。
// 过期或篡改的游标要求重新同步。
type logCursor struct {
	Scope    string `json:"scope"`
	Position string `json:"position"`
	Mode     string `json:"mode"`
	Expires  int64  `json:"expires"`
}

// ValidateLogFilter 在查询与导出入口共享完全一致的时间和级别边界。
// 纯文本搜索不当作正则或 SQL 模式执行。
func ValidateLogFilter(filter LogFilter) error {
	if filter.SourceID == "" || len(filter.SourceID) > 200 || len(filter.Search) > 200 || !utf8.ValidString(filter.Search) {
		return Fail(422, "INVALID_INPUT", "日志来源或搜索无效")
	}
	if filter.Level != "all" && filter.Level != "debug" && filter.Level != "info" && filter.Level != "warn" && filter.Level != "error" && filter.Level != "unknown" {
		return Fail(422, "INVALID_INPUT", "日志级别无效")
	}
	from, err := time.Parse(time.RFC3339Nano, filter.From)
	if err != nil {
		return Fail(422, "INVALID_INPUT", "日志开始时间无效")
	}
	to := time.Now().UTC()
	if filter.To != "" {
		to, err = time.Parse(time.RFC3339Nano, filter.To)
		if err != nil {
			return Fail(422, "INVALID_INPUT", "日志结束时间无效")
		}
	}
	maxRange := 24*time.Hour + time.Minute
	if strings.HasPrefix(filter.SourceID, "task:") {
		maxRange = 365 * 24 * time.Hour
	}
	if !from.Before(to) || to.Sub(from) > maxRange {
		return Fail(422, "INVALID_INPUT", "单次日志查询范围不得超过 24 小时")
	}
	return nil
}

// LogSources 只列面板、审计和登记应用来源。
// 实际查询仍重新验证来源授权。
func (s *Service) LogSources(ctx context.Context) ([]LogSource, error) {
	makeSource := func(id, label string) LogSource {
		source := LogSource{ID: id, Label: label}
		source.Capabilities.Stream = true
		source.Capabilities.Export = true
		return source
	}
	sources := []LogSource{makeSource("panel", "面板服务"), makeSource("audit", "操作审计")}
	apps, err := s.Repo.Apps(ctx)
	if err != nil {
		return nil, err
	}
	for _, app := range apps {
		source := makeSource("app:"+app.ID, app.Name)
		if !s.Config.Helper.Enabled {
			source.Capabilities.Stream = false
			source.Capabilities.Export = false
		}
		sources = append(sources, source)
	}
	return sources, nil
}

// logScope 为不变筛选及当前操作人生成稳定摘要。
// 改变来源、关键词或时间范围都会使旧游标失效。
func logScope(actor int64, filter LogFilter) string {
	body, _ := json.Marshal(filter)
	sum := sha256.Sum256(append([]byte(strconv.FormatInt(actor, 10)+":"), body...))
	return hex.EncodeToString(sum[:])
}

// encodeLogCursor 产生最多二十四小时有效的不透明续传值。
// 签名采用日志专用域隔离。
func (s *Service) encodeLogCursor(actor int64, filter LogFilter, position, mode string) string {
	body, _ := json.Marshal(logCursor{Scope: logScope(actor, filter), Position: position, Mode: mode, Expires: time.Now().Add(24 * time.Hour).Unix()})
	value := base64.RawURLEncoding.EncodeToString(body)
	return value + "." + s.Vault.Sign("log-cursor", value)
}

// decodeLogCursor 不接受不同主体、不同筛选或不同方向的游标。
// 校验失败统一返回 CURSOR_EXPIRED，客户端显示缺口后重新同步。
func (s *Service) decodeLogCursor(actor int64, filter LogFilter, cursor, mode string) (string, error) {
	if cursor == "" {
		return "", nil
	}
	value, signature, ok := strings.Cut(cursor, ".")
	if !ok || len(cursor) > 8192 || !s.Vault.Verify("log-cursor", value, signature) {
		return "", Fail(409, "CURSOR_EXPIRED", "日志游标已失效，请重新同步")
	}
	body, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", Fail(409, "CURSOR_EXPIRED", "日志游标无效")
	}
	var parsed logCursor
	if json.Unmarshal(body, &parsed) != nil || parsed.Scope != logScope(actor, filter) || parsed.Mode != mode || parsed.Expires < time.Now().Unix() {
		return "", Fail(409, "CURSOR_EXPIRED", "日志筛选已变化或游标已过期")
	}
	return parsed.Position, nil
}

// queryLogs 根据白名单来源查询有限记录，查询前与输出前都实施边界。
// 所有返回日志均为 UTF-8 文本，不把控制内容解释为标记语言。
func (s *Service) queryLogs(ctx context.Context, actor int64, filter LogFilter, position string, tail bool, limit int) ([]LogRecord, string, bool, error) {
	if err := ValidateLogFilter(filter); err != nil {
		return nil, "", false, err
	}
	if limit < 1 || limit > 1000 {
		return nil, "", false, Fail(422, "INVALID_INPUT", "日志页大小无效")
	}
	from, _ := time.Parse(time.RFC3339Nano, filter.From)
	to := time.Now().UTC()
	if filter.To != "" {
		to, _ = time.Parse(time.RFC3339Nano, filter.To)
	}
	items := []LogRecord{}
	last := position
	more := false
	if strings.HasPrefix(filter.SourceID, "app:") {
		id := strings.TrimPrefix(filter.SourceID, "app:")
		if _, err := s.Repo.App(ctx, id); err != nil {
			return nil, "", false, err
		}
		if !s.Config.Helper.Enabled {
			return nil, "", false, Fail(503, "CAPABILITY_UNAVAILABLE", "应用 journal 需要可用的本机 helper")
		}
		secretValues, err := s.redactValues(ctx, id)
		if err != nil {
			return nil, "", false, err
		}
		request := host.Request{Action: "app.logs", ID: id, From: filter.From, To: filter.To, Limit: 1000}
		if tail {
			request.After = position
		} else {
			request.Before = position
		}
		result, err := s.Host.Call(ctx, request)
		if err != nil {
			return nil, "", false, Fail(409, "CURSOR_EXPIRED", "应用日志暂时不可读或已轮转，请重新同步")
		}
		lines := result.Lines
		more = result.More
		for _, line := range lines {
			last = line.Cursor
			message, truncated := redactLog(line.Message, secretValues)
			if filter.Level != "all" && filter.Level != line.Level || !strings.Contains(strings.ToLower(message), strings.ToLower(filter.Search)) {
				continue
			}
			items = append(items, LogRecord{ID: "j:" + base64.RawURLEncoding.EncodeToString([]byte(line.Cursor)), SourceID: filter.SourceID, At: line.At, Level: line.Level, Message: message, Truncated: truncated || line.Truncated})
			if len(items) == limit {
				more = true
				break
			}
		}
		if len(lines) == request.Limit {
			more = true
		}
		sort.SliceStable(items, func(i, j int) bool { return items[i].At.Before(items[j].At) })
		return items, last, more, nil
	}
	table := ""
	expression := "message"
	levelExpression := "level"
	args := []any{from, to, filter.Level, filter.Search}
	actorClause := ""
	switch filter.SourceID {
	case "panel":
		table = "app.panel_logs"
	case "audit":
		table = "app.audit_events"
		expression = "action || ' · ' || result || ' · ' || message"
		levelExpression = "CASE WHEN result IN ('failed','denied','interrupted') THEN 'warn' ELSE 'info' END"
	default:
		if strings.HasPrefix(filter.SourceID, "task:") {
			id := strings.TrimPrefix(filter.SourceID, "task:")
			if _, err := s.Repo.Task(ctx, id, actor); err != nil {
				return nil, "", false, err
			}
			table = "app.task_logs"
			args = append(args, id)
			actorClause = " AND task_id=$5"
		} else {
			return nil, "", false, Fail(404, "RESOURCE_NOT_FOUND", "日志来源不存在")
		}
	}
	comparison, order := "<", "DESC"
	if tail {
		comparison, order = ">", "ASC"
	}
	where := ""
	if position != "" {
		seq, err := strconv.ParseInt(position, 10, 64)
		if err != nil || seq < 0 {
			return nil, "", false, Fail(409, "CURSOR_EXPIRED", "日志位置无效")
		}
		if seq > 0 {
			// 清理后不能跨过已丢失的锚点继续输出，避免把日志缺口伪装成完整续传。
			var exists bool
			if err = s.Repo.DB.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM "+table+" WHERE id=$1)", seq).Scan(&exists); err != nil {
				return nil, "", false, err
			}
			if !exists {
				return nil, "", false, Fail(409, "CURSOR_EXPIRED", "日志锚点已被清理，请重新同步")
			}
		}
		args = append(args, seq)
		where = fmt.Sprintf(" AND id %s $%d", comparison, len(args))
	}
	args = append(args, limit+1)
	query := fmt.Sprintf("SELECT id,at,%s,%s FROM %s WHERE at >= $1 AND at <= $2 AND ($3='all' OR %s=$3) AND strpos(lower(%s),lower($4))>0%s%s ORDER BY id %s LIMIT $%d", levelExpression, expression, table, levelExpression, expression, actorClause, where, order, len(args))
	rows, err := s.Repo.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, "", false, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var record LogRecord
		if err = rows.Scan(&id, &record.At, &record.Level, &record.Message); err != nil {
			return nil, "", false, err
		}
		if len(items) == limit {
			more = true
			break
		}
		record.ID = strconv.FormatInt(id, 10)
		record.SourceID = filter.SourceID
		record.At = record.At.UTC()
		record.Message = strings.ToValidUTF8(record.Message, "�")
		if len(record.Message) > 16<<10 {
			record.Message = strings.ToValidUTF8(record.Message[:16<<10], "")
			record.Truncated = true
		}
		items = append(items, record)
		last = record.ID
	}
	if err = rows.Err(); err != nil {
		return nil, "", false, err
	}
	if !tail {
		slicesReverse(items)
	}
	return items, last, more, nil
}

// slicesReverse 原地把倒序查询变成显示使用的时间升序。
// 不复制日志正文，保持每页内存上限。
func slicesReverse(items []LogRecord) {
	for left, right := 0, len(items)-1; left < right; left, right = left+1, right-1 {
		items[left], items[right] = items[right], items[left]
	}
}

// Logs 返回历史页和绑定当前筛选的 tail 游标。
// 空结果也返回明确游标，以便之后新增记录续接。
func (s *Service) Logs(ctx context.Context, actor int64, filter LogFilter, cursor string, limit int) (LogPage, error) {
	page := LogPage{Page: Page[LogRecord]{Items: []LogRecord{}}}
	position, err := s.decodeLogCursor(actor, filter, cursor, "history")
	if err != nil {
		return page, err
	}
	items, last, more, err := s.queryLogs(ctx, actor, filter, position, false, limit)
	if err != nil {
		return page, err
	}
	page.Items = items
	if more {
		next := s.encodeLogCursor(actor, filter, last, "history")
		page.NextCursor = &next
	}
	tailPosition := "0"
	if strings.HasPrefix(filter.SourceID, "app:") {
		tailPosition = last
		if len(items) > 0 {
			raw, decodeErr := base64.RawURLEncoding.DecodeString(strings.TrimPrefix(items[len(items)-1].ID, "j:"))
			if decodeErr != nil {
				return page, decodeErr
			}
			tailPosition = string(raw)
		}
	}
	if len(items) > 0 && !strings.HasPrefix(filter.SourceID, "app:") {
		tailPosition = items[len(items)-1].ID
	}
	tail := s.encodeLogCursor(actor, filter, tailPosition, "tail")
	page.TailCursor = &tail
	return page, nil
}

// redactLog 在截断之前替换完整秘密，避免长秘密的前缀因截断逃过替换。
// 客户端永远只接收有效 UTF-8 和明确的截断标识。
func redactLog(message string, secrets []string) (string, bool) {
	for _, secret := range secrets {
		if secret != "" {
			message = strings.ReplaceAll(message, secret, "[REDACTED]")
		}
	}
	message = strings.ToValidUTF8(message, "�")
	truncated := len(message) > 16<<10
	if truncated {
		message = strings.ToValidUTF8(message[:16<<10], "")
	}
	return message, truncated
}

// TailLogs 在分页边界后读取增量，字节超过单批预算会报告丢弃。
// 历史游标不能被用来绕过筛选重放。
func (s *Service) TailLogs(ctx context.Context, actor int64, filter LogFilter, cursor string) (LogBatch, error) {
	batch := LogBatch{SourceID: filter.SourceID, Records: []LogRecord{}}
	position, err := s.decodeLogCursor(actor, filter, cursor, "tail")
	if err != nil {
		return batch, err
	}
	items, last, _, err := s.queryLogs(ctx, actor, filter, position, true, 500)
	if err != nil {
		return batch, err
	}
	bytes := 0
	for _, item := range items {
		bytes += len(item.Message) + 128
		if bytes > 1<<20 {
			batch.DroppedCount++
			continue
		}
		batch.Records = append(batch.Records, item)
	}
	batch.Cursor = s.encodeLogCursor(actor, filter, last, "tail")
	return batch, nil
}

// exportLogs 受控分页写入最多五十 MiB 临时文件，十分钟后失效。
// 写入中取消或失败不会产生可下载的部分文件。
func (s *Service) exportLogs(ctx context.Context, actor int64, task *Task, filter *LogFilter) error {
	if filter == nil {
		return Fail(422, "INVALID_INPUT", "导出筛选缺失")
	}
	if err := ValidateLogFilter(*filter); err != nil {
		return err
	}
	if filter.To == "" {
		filter.To = time.Now().UTC().Format(time.RFC3339Nano)
	}
	if err := s.taskStage(ctx, task, "export", true, nil, nil); err != nil {
		return err
	}
	if err := directoryQuota(ctx, s.Config.Paths.ExportRoot, 50<<20, 500<<20); err != nil {
		return err
	}
	root, err := os.OpenRoot(s.Config.Paths.ExportRoot)
	if err != nil {
		return err
	}
	defer root.Close()
	filename := task.ID + ".log"
	file, err := root.OpenFile(filename, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	complete := false
	defer func() {
		file.Close()
		if !complete {
			_ = root.Remove(filename)
		}
	}()
	position := ""
	var size int64
	for pages := 0; pages < 10000; pages++ {
		if err = ctx.Err(); err != nil {
			return err
		}
		items, last, more, err := s.queryLogs(ctx, actor, *filter, position, false, 1000)
		if err != nil {
			return err
		}
		for i := len(items) - 1; i >= 0; i-- {
			line := items[i]
			text := line.At.Format(time.RFC3339Nano) + " [" + line.Level + "] " + line.Message
			if line.Truncated {
				text += " [TRUNCATED]"
			}
			text += "\n"
			size += int64(len(text))
			if size > 50<<20 {
				return Fail(422, "EXPORT_TOO_LARGE", "导出超过 50 MiB，请缩小筛选范围")
			}
			if _, err = file.WriteString(text); err != nil {
				return err
			}
		}
		if !more {
			break
		}
		if last == position {
			return Fail(409, "CURSOR_EXPIRED", "导出期间日志游标无法继续")
		}
		position = last
		if pages == 9999 {
			return Fail(422, "EXPORT_TOO_LARGE", "导出记录数量超过上限")
		}
	}
	if err = file.Sync(); err != nil {
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	expires := time.Now().UTC().Add(10 * time.Minute)
	if err = s.taskStage(ctx, task, "commit", false, nil, nil); err != nil {
		return err
	}
	if _, err = s.Repo.DB.Exec(ctx, "INSERT INTO app.log_exports(id,actor_id,path,expires_at,bytes) VALUES($1,$2,$3,$4,$5)", task.ID, actor, filename, expires, size); err != nil {
		return err
	}
	complete = true
	task.Result = map[string]any{"exportId": task.ID, "bytes": size, "expiresAt": expires, "order": "newest-first"}
	return nil
}

// OpenExport 在下载当时重新验证操作人和有效期，然后以受限根目录打开。
// 临时文件路径不由 URL 指定。
func (s *Service) OpenExport(ctx context.Context, actor int64, id string) (*os.File, int64, error) {
	if !resourcePattern.MatchString(id) {
		return nil, 0, Fail(404, "RESOURCE_NOT_FOUND", "导出不存在")
	}
	var size int64
	var valid bool
	if err := s.Repo.DB.QueryRow(ctx, "SELECT bytes,expires_at>now() FROM app.log_exports WHERE id=$1 AND actor_id=$2", id, actor).Scan(&size, &valid); err != nil {
		return nil, 0, Fail(404, "RESOURCE_NOT_FOUND", "导出不存在或已过期")
	}
	if !valid {
		return nil, 0, Fail(410, "EXPORT_EXPIRED", "导出已过期，请重新创建")
	}
	root, err := os.OpenRoot(s.Config.Paths.ExportRoot)
	if err != nil {
		return nil, 0, err
	}
	defer root.Close()
	file, err := root.Open(id + ".log")
	if errors.Is(err, os.ErrNotExist) {
		return nil, 0, Fail(410, "EXPORT_EXPIRED", "导出文件已清理")
	}
	return file, size, err
}
