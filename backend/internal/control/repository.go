package control

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"strconv"
)

// Repository 集中参数化业务 SQL 和事务边界。
// HTTP 层不得绕过服务直接访问连接池。
type Repository struct{ DB *pgxpool.Pool }

// decodeRow 将持久 JSON 映射回明确领域模型。
// 缺失资源与数据库故障使用不同错误。
func decodeRow[T any](row pgx.Row) (T, error) {
	var value T
	var raw []byte
	if err := row.Scan(&raw); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return value, Fail(404, "RESOURCE_NOT_FOUND", "资源不存在或已经移除")
		}
		return value, err
	}
	err := json.Unmarshal(raw, &value)
	return value, err
}

// listJSON 只接受仓储内的固定 SQL，并显式检查迭代错误。
// 空结果返回 [] 而不是 null。
func listJSON[T any](ctx context.Context, db *pgxpool.Pool, query string, args ...any) ([]T, error) {
	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []T{}
	for rows.Next() {
		item, err := decodeRow[T](rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// Task 返回属于当前操作人的任务。
// 不使用资源 ID 的不可猜测性替代授权。
func (r *Repository) Task(ctx context.Context, id string, actor int64) (Task, error) {
	return decodeRow[Task](r.DB.QueryRow(ctx, "SELECT payload FROM app.tasks WHERE id=$1 AND actor_id=$2", id, actor))
}

// Tasks 返回当前操作人的有限任务列表。
// 非终态在前，失败次之，然后按创建时间倒序。
func (r *Repository) Tasks(ctx context.Context, actor int64, status string, limit, offset int) (Page[Task], error) {
	items, err := listJSON[Task](ctx, r.DB, "SELECT payload FROM app.tasks WHERE actor_id=$1 AND ($2='' OR status=$2) ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 0 WHEN 'failed' THEN 1 WHEN 'interrupted' THEN 1 ELSE 2 END,created_at DESC,id LIMIT $3 OFFSET $4", actor, status, limit+1, offset)
	if err != nil {
		return Page[Task]{}, err
	}
	return paginate(items, limit, offset), nil
}

// paginate 产生不包含秘密或磁盘路径的游标。
// 游标仅是分页位置，查询仍需要身份过滤。
func paginate[T any](items []T, limit, offset int) Page[T] {
	page := Page[T]{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		cursor := base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset + limit)))
		page.NextCursor = &cursor
	}
	return page
}

// Offset 校验分页游标的格式和资源消耗边界。
// 超出保留窗口的巨大偏移要求重新查询。
func Offset(cursor string) (int, error) {
	if cursor == "" {
		return 0, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, Fail(422, "INVALID_INPUT", "分页游标无效")
	}
	n, err := strconv.Atoi(string(raw))
	if err != nil || n < 0 || n > 100000 {
		return 0, Fail(422, "INVALID_INPUT", "分页游标无效")
	}
	return n, nil
}

// PageCursor 为受数量限制的资源列表编码下一页位置。
// 解码仍由 Offset 检查，游标不承担访问授权。
func PageCursor(offset int) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset)))
}

// Installations 合并配置引用与默认指针，避免 JSON 快照产生虚假引用数。
// 运行进程引用由本机扫描补充。
func (r *Repository) Installations(ctx context.Context, kind string) ([]Installation, error) {
	rows, err := r.DB.Query(ctx, `SELECT i.payload,i.revision,EXISTS(SELECT 1 FROM app.runtime_defaults d WHERE d.installation_id=i.id),(SELECT count(*) FROM app.managed_apps a WHERE a.runtime_id=i.id) FROM app.runtime_installations i WHERE ($1='' OR i.kind=$1) ORDER BY i.kind,i.path`, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Installation{}
	for rows.Next() {
		var raw []byte
		var revision int64
		var item Installation
		var def bool
		var refs int
		if err = rows.Scan(&raw, &revision, &def, &refs); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		item.Revision = Revision(revision)
		item.IsPanelDefault = def
		item.ConfiguredAppRefs = refs
		items = append(items, item)
	}
	return items, rows.Err()
}

// Apps 返回已登记应用的非秘密配置。
// 运行状态由监督器核实后再输出。
func (r *Repository) Apps(ctx context.Context) ([]App, error) {
	return listJSON[App](ctx, r.DB, "SELECT payload FROM app.managed_apps ORDER BY name,id")
}

// App 根据内部资源 ID 读取配置，不接受 unit 名称代替。
// 未登记系统服务不属于该资源集合。
func (r *Repository) App(ctx context.Context, id string) (App, error) {
	return decodeRow[App](r.DB.QueryRow(ctx, "SELECT payload FROM app.managed_apps WHERE id=$1", id))
}

// Audit 保存脱敏的受理、拒绝与执行结果。
// message 必须来自静态业务说明，不能传入原始用户参数。
func (r *Repository) Audit(ctx context.Context, actor int64, action, resource, task, request, result, message string) error {
	_, err := r.DB.Exec(ctx, "INSERT INTO app.audit_events(actor_id,action,resource_id,task_id,request_id,result,message) VALUES(NULLIF($1,0),$2,NULLIF($3,''),NULLIF($4,''),$5,$6,$7)", actor, action, resource, task, request, result, message)
	return err
}
