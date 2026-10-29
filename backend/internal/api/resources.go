package api

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/gin-gonic/gin"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"zx-panel/internal/control"
)

// registerResources 注册六页共用的真实资源接口与唯一计划写入口。
// 静态页面路由不会劫持未知 API 的 404 或 405。
func (p *panelAPI) registerResources(router *gin.RouterGroup) {
	router.GET("/bootstrap", func(c *gin.Context) {
		cursor, epoch := p.service.Events.Cursor()
		tasks, err := p.service.Repo.Tasks(c.Request.Context(), sessionFrom(c).User.ID, "", 100, 0)
		if err != nil {
			p.failure(c, err)
			return
		}
		active := []control.Task{}
		for _, task := range tasks.Items {
			if task.Status == "running" || task.Status == "queued" {
				active = append(active, task)
			}
		}
		p.answer(c, 200, gin.H{"system": p.service.Metrics.Info(), "capabilities": p.service.Capabilities(c.Request.Context()), "latestMetrics": p.service.Metrics.Snapshot(), "activeTasks": active, "streamCursor": cursor, "streamEpoch": epoch})
	})
	router.GET("/system/info", func(c *gin.Context) { p.answer(c, 200, p.service.Metrics.Info()) })
	router.GET("/system/capabilities", func(c *gin.Context) { p.answer(c, 200, p.service.Capabilities(c.Request.Context())) })
	router.GET("/metrics/latest", func(c *gin.Context) { p.answer(c, 200, p.service.Metrics.Snapshot()) })
	router.GET("/metrics/history", func(c *gin.Context) {
		from, e1 := time.Parse(time.RFC3339Nano, c.Query("from"))
		to, e2 := time.Parse(time.RFC3339Nano, c.Query("to"))
		step, e3 := strconv.Atoi(c.Query("stepSeconds"))
		if e1 != nil || e2 != nil || e3 != nil {
			p.failure(c, control.Fail(422, "INVALID_INPUT", "历史查询参数无效"))
			return
		}
		result, err := p.service.Metrics.History(c.Request.Context(), p.service.Repo, c.Query("metric"), c.Query("deviceId"), from, to, step)
		respond(p, c, result, err)
	})
	router.GET("/runtimes", func(c *gin.Context) {
		result, err := p.service.RuntimeSummaries(c.Request.Context())
		respond(p, c, result, err)
	})
	router.GET("/runtimes/:kind/installations", func(c *gin.Context) {
		kind := c.Param("kind")
		if !control.IsRuntimeKind(kind) {
			p.failure(c, control.Fail(404, "RESOURCE_NOT_FOUND", "运行时类别不存在"))
			return
		}
		limit, offset, err := pageParams(c, 200)
		if err != nil {
			p.failure(c, err)
			return
		}
		items, err := p.service.Repo.Installations(c.Request.Context(), kind)
		if err != nil {
			p.failure(c, err)
			return
		}
		p.answer(c, 200, arrayPage(items, limit, offset))
	})
	router.GET("/runtimes/:kind/releases", func(c *gin.Context) {
		limit, offset, err := pageParams(c, 200)
		if err != nil {
			p.failure(c, err)
			return
		}
		result, err := p.service.Catalog(c.Request.Context(), c.Param("kind"), limit, offset)
		respond(p, c, result, err)
	})
	router.GET("/runtime-installations/:id/references", func(c *gin.Context) {
		result, err := p.service.References(c.Request.Context(), c.Param("id"))
		respond(p, c, result, err)
	})
	router.POST("/runtimes/catalog/refresh", p.csrf(), p.rateLimit(10), func(c *gin.Context) {
		var input struct {
			Kinds []string `json:"kinds"`
		}
		if !p.decode(c, &input) {
			return
		}
		if len(input.Kinds) < 1 || len(input.Kinds) > 2 {
			p.failure(c, control.Fail(422, "INVALID_INPUT", "请选择 Node.js 或 Go 目录"))
			return
		}
		for _, kind := range input.Kinds {
			if kind != "node" && kind != "go" {
				p.failure(c, control.Fail(422, "INVALID_INPUT", "运行时类别无效"))
				return
			}
		}
		slices.Sort(input.Kinds)
		input.Kinds = slices.Compact(input.Kinds)
		task, err := p.service.SubmitSimple(c.Request.Context(), sessionFrom(c).User.ID, c.GetHeader("Idempotency-Key"), control.Work{Operation: control.Operation{Action: "catalog.refresh"}, Kind: strings.Join(input.Kinds, ",")})
		if err != nil {
			p.failure(c, err)
			return
		}
		p.answer(c, 202, task)
	})
	router.POST("/operations/preview", p.csrf(), p.rateLimit(30), func(c *gin.Context) {
		var raw json.RawMessage
		if !p.decode(c, &raw) {
			return
		}
		op, err := control.DecodeOperation(raw)
		if err != nil {
			p.failure(c, err)
			return
		}
		result, err := p.service.Preview(c.Request.Context(), sessionFrom(c).User.ID, op)
		respond(p, c, result, err)
	})
	router.POST("/operations", p.csrf(), func(c *gin.Context) {
		var input control.Acceptance
		if !p.decode(c, &input) {
			return
		}
		task, err := p.service.Accept(c.Request.Context(), sessionFrom(c).User.ID, c.GetHeader("Idempotency-Key"), input)
		if err != nil {
			p.failure(c, err)
			return
		}
		p.answer(c, 202, task)
	})
	router.GET("/apps", func(c *gin.Context) {
		limit, offset, err := pageParams(c, 200)
		if err != nil {
			p.failure(c, err)
			return
		}
		items, err := p.service.Apps(c.Request.Context())
		if err != nil {
			p.failure(c, err)
			return
		}
		filtered := []control.App{}
		search := strings.ToLower(c.Query("filter"))
		if len(search) > 200 {
			p.failure(c, control.Fail(422, "INVALID_INPUT", "筛选内容过长"))
			return
		}
		for _, app := range items {
			if strings.Contains(strings.ToLower(app.Name), search) {
				filtered = append(filtered, app)
			}
		}
		p.answer(c, 200, arrayPage(filtered, limit, offset))
	})
	router.GET("/apps/:id", func(c *gin.Context) {
		result, err := p.service.App(c.Request.Context(), c.Param("id"))
		respond(p, c, result, err)
	})
	router.GET("/processes", func(c *gin.Context) {
		limit, _, err := pageParams(c, 200)
		if err != nil {
			p.failure(c, err)
			return
		}
		result, err := p.service.Metrics.Processes(c.Query("search"), c.Query("sort"), c.Query("cursor"), limit)
		respond(p, c, result, err)
	})
	router.GET("/tasks", func(c *gin.Context) {
		limit, offset, err := pageParams(c, 200)
		if err != nil {
			p.failure(c, err)
			return
		}
		status := c.Query("status")
		if !slices.Contains([]string{"", "queued", "running", "succeeded", "failed", "canceled", "interrupted"}, status) {
			p.failure(c, control.Fail(422, "INVALID_INPUT", "任务状态无效"))
			return
		}
		result, err := p.service.Repo.Tasks(c.Request.Context(), sessionFrom(c).User.ID, status, limit, offset)
		respond(p, c, result, err)
	})
	router.GET("/tasks/:id", func(c *gin.Context) {
		result, err := p.service.Repo.Task(c.Request.Context(), c.Param("id"), sessionFrom(c).User.ID)
		respond(p, c, result, err)
	})
	router.POST("/tasks/:id/cancel", p.csrf(), func(c *gin.Context) {
		if !p.noBody(c) {
			return
		}
		result, err := p.service.CancelTask(c.Request.Context(), sessionFrom(c).User.ID, c.Param("id"))
		respond(p, c, result, err)
	})
	router.GET("/tasks/:id/logs", func(c *gin.Context) {
		limit := 500
		if value := c.Query("limit"); value != "" {
			n, err := strconv.Atoi(value)
			if err != nil || n < 1 || n > 500 {
				p.failure(c, control.Fail(422, "INVALID_INPUT", "日志页大小无效"))
				return
			}
			limit = n
		}
		task, err := p.service.Repo.Task(c.Request.Context(), c.Param("id"), sessionFrom(c).User.ID)
		if err != nil {
			p.failure(c, err)
			return
		}
		filter := control.LogFilter{SourceID: "task:" + task.ID, Level: "all", From: task.CreatedAt.Format(time.RFC3339Nano)}
		if time.Since(task.CreatedAt) > 24*time.Hour {
			filter.From = time.Now().Add(-24 * time.Hour).UTC().Format(time.RFC3339Nano)
		}
		result, err := p.service.Logs(c.Request.Context(), sessionFrom(c).User.ID, filter, c.Query("cursor"), limit)
		respond(p, c, result, err)
	})
	router.GET("/events", p.events)
	router.GET("/logs/sources", func(c *gin.Context) {
		result, err := p.service.LogSources(c.Request.Context())
		respond(p, c, result, err)
	})
	router.GET("/logs", func(c *gin.Context) {
		filter, limit, err := logParams(c)
		if err != nil {
			p.failure(c, err)
			return
		}
		result, err := p.service.Logs(c.Request.Context(), sessionFrom(c).User.ID, filter, c.Query("cursor"), limit)
		respond(p, c, result, err)
	})
	router.GET("/logs/stream", p.logStream)
	router.POST("/logs/exports", p.csrf(), p.rateLimit(5), func(c *gin.Context) {
		var filter control.LogFilter
		if !p.decode(c, &filter) {
			return
		}
		if err := control.ValidateLogFilter(filter); err != nil {
			p.failure(c, err)
			return
		}
		task, err := p.service.SubmitSimple(c.Request.Context(), sessionFrom(c).User.ID, c.GetHeader("Idempotency-Key"), control.Work{Operation: control.Operation{Action: "logs.export"}, Logs: &filter})
		if err != nil {
			p.failure(c, err)
			return
		}
		p.answer(c, 202, task)
	})
	router.GET("/logs/exports/:id/download", func(c *gin.Context) {
		file, size, err := p.service.OpenExport(c.Request.Context(), sessionFrom(c).User.ID, c.Param("id"))
		if err != nil {
			p.failure(c, err)
			return
		}
		defer file.Close()
		c.Header("Content-Disposition", "attachment; filename=zx-panel-logs.txt")
		c.DataFromReader(200, size, "text/plain; charset=utf-8", file, nil)
	})
	router.GET("/settings", func(c *gin.Context) {
		result, err := p.service.Settings(c.Request.Context())
		respond(p, c, result, err)
	})
	router.PATCH("/settings", p.csrf(), func(c *gin.Context) {
		var input control.SettingsChange
		if !p.decode(c, &input) {
			return
		}
		result, err := p.service.SaveSettings(c.Request.Context(), sessionFrom(c).User.ID, input)
		respond(p, c, result, err)
	})
}

// respond 统一成功读取与领域错误的转换。
// 泛型只作用于类型安全响应，不定义第二套业务仓储。
func respond[T any](p *panelAPI, c *gin.Context, result T, err error) {
	if err != nil {
		p.failure(c, err)
		return
	}
	p.answer(c, 200, result)
}

// arrayPage 对已经有资源数上限的共享快照做分页。
// 空页保持 []，不用 null 破坏前端契约。
func arrayPage[T any](items []T, limit, offset int) control.Page[T] {
	page := control.Page[T]{Items: []T{}}
	if offset >= len(items) {
		return page
	}
	end := min(offset+limit, len(items))
	page.Items = items[offset:end]
	if end < len(items) {
		cursor := control.PageCursor(end)
		page.NextCursor = &cursor
	}
	return page
}

// logParams 给日志查询设置有限默认窗口，并验证独立日志页上限。
// URL 中的日志游标不使用普通列表 offset 解码。
func logParams(c *gin.Context) (control.LogFilter, int, error) {
	filter := control.LogFilter{SourceID: c.Query("sourceId"), Level: c.DefaultQuery("level", "all"), Search: c.Query("search"), From: c.DefaultQuery("from", time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)), To: c.Query("to")}
	limit := 500
	if value := c.Query("limit"); value != "" {
		n, err := strconv.Atoi(value)
		if err != nil || n < 1 || n > 500 {
			return filter, limit, control.Fail(422, "INVALID_INPUT", "日志页大小无效")
		}
		limit = n
	}
	return filter, limit, control.ValidateLogFilter(filter)
}

// streamHeaders 关闭代理缓冲与缓存，保持浏览器标准 EventSource 语义。
// 每次实际写入另有十秒超时限制。
func streamHeaders(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-store")
	c.Header("X-Accel-Buffering", "no")
	c.Status(200)
}

// events 使用有界重放队列，在每个数据帧之前复核认证。
// 心跳仅表达连接活性，不制造新的指标样本。
func (p *panelAPI) events(c *gin.Context) {
	session := sessionFrom(c)
	after := c.GetHeader("Last-Event-ID")
	if after == "" {
		after = c.Query("after")
	}
	sub, history, reset, err := p.service.Events.Subscribe(after, session.User.ID)
	if err != nil {
		p.failure(c, err)
		return
	}
	defer sub.Close()
	streamHeaders(c)
	_, epoch := p.service.Events.Cursor()
	if reset {
		_ = streamFrame(c, "", "reset", gin.H{"streamEpoch": epoch, "payload": gin.H{"reason": "CURSOR_EXPIRED"}})
		return
	}
	for _, event := range history {
		if !sub.Active() || !p.validStreamSession(c.Request.Context(), session) {
			return
		}
		if err = streamFrame(c, event.ID, event.Name, event); err != nil {
			return
		}
	}
	heartbeat := time.Now()
	for {
		bounded, cancel := context.WithTimeout(c.Request.Context(), time.Second)
		event, ok := sub.Next(bounded)
		timeout := errors.Is(bounded.Err(), context.DeadlineExceeded)
		cancel()
		if c.Request.Context().Err() != nil {
			return
		}
		if !p.validStreamSession(c.Request.Context(), session) {
			_ = streamFrame(c, "", "auth.expired", gin.H{"streamEpoch": epoch, "payload": gin.H{}})
			return
		}
		if !sub.Active() {
			return
		}
		if ok {
			if err = streamFrame(c, event.ID, event.Name, event); err != nil {
				return
			}
		} else if !timeout {
			return
		}
		if time.Since(heartbeat) >= 15*time.Second {
			if err = streamFrame(c, "", "heartbeat", gin.H{"streamEpoch": epoch, "payload": gin.H{"serverTime": time.Now().UTC()}}); err != nil {
				return
			}
			heartbeat = time.Now()
		}
	}
}

// logStream 每个会话最多一条当前日志流，离开页面或撤销认证就释放配额。
// 只在前一批写完后读取下一批，慢消费者不会积压无界队列。
func (p *panelAPI) logStream(c *gin.Context) {
	filter, _, err := logParams(c)
	if err != nil {
		p.failure(c, err)
		return
	}
	session := sessionFrom(c)
	key := string(session.Hash)
	p.streamMu.Lock()
	if p.logStreams[key] >= 1 {
		p.streamMu.Unlock()
		p.failure(c, control.Fail(429, "RATE_LIMITED", "此会话已有日志流"))
		return
	}
	p.logStreams[key]++
	p.streamMu.Unlock()
	defer func() { p.streamMu.Lock(); delete(p.logStreams, key); p.streamMu.Unlock() }()
	cursor := c.Query("after")
	if cursor == "" {
		page, err := p.service.Logs(c.Request.Context(), session.User.ID, filter, "", 1)
		if err != nil {
			p.failure(c, err)
			return
		}
		if page.TailCursor != nil {
			cursor = *page.TailCursor
		}
	}
	streamHeaders(c)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	heartbeat := time.Now()
	for {
		if !p.validStreamSession(c.Request.Context(), session) {
			_ = streamFrame(c, "", "auth.expired", gin.H{})
			return
		}
		batch, err := p.service.TailLogs(c.Request.Context(), session.User.ID, filter, cursor)
		if err != nil {
			_ = streamFrame(c, "", "logs.reset", gin.H{"sourceId": filter.SourceID, "reason": "CURSOR_EXPIRED"})
			return
		}
		cursor = batch.Cursor
		if len(batch.Records) > 0 || batch.DroppedCount > 0 {
			if err = streamFrame(c, "", "logs.batch", batch); err != nil {
				return
			}
		}
		if time.Since(heartbeat) >= 15*time.Second {
			if err = streamFrame(c, "", "heartbeat", gin.H{"serverTime": time.Now().UTC()}); err != nil {
				return
			}
			heartbeat = time.Now()
		}
		select {
		case <-c.Request.Context().Done():
			return
		case <-ticker.C:
		}
	}
}

// jsonEncode 保持 SSE 每个 data 字段为一行完整 JSON。
// JSON 编码器转义换行，用户日志不能注入额外 SSE 帧。
func jsonEncode(writer http.ResponseWriter, value any) error {
	return json.NewEncoder(writer).Encode(value)
}
