# v1.1 仓库适配决定

实施基线见 implementation.md。以下已获用户确认的差异优先于原文示例：

| 事项 | 本仓库决定 |
| --- | --- |
| 持久化 | PostgreSQL/pgx；保留 app.users 及密码摘要，升级时撤销旧会话 |
| UI 原语 | 官方 shadcn Base UI + Nova，不迁移到 Radix |
| 工程 | 保留根目录 Vite、src、cmd/server、internal 与现有 Go module |
| API | success/data/error + meta；不使用 ok 字段 |
| 主题 | zx-panel-theme；登录及 setup 跟随系统、无明确亮色时暗色 |
| 开发入口 | Vite 7200，API 127.0.0.1:25000 |
| 数据库运维 | 版本化 SQL 迁移、pg_dump/pg_restore，非 SQLite PRAGMA/WAL 文件复制 |
| 数据配额 | 监控聚合按时间/行数限额和关系体积告警，不把 PostgreSQL 全库作为可随意裁剪的单文件 |
| 验收 | Linux/systemd；用户于 2026-09-29 明确允许 WSL 模拟实验，记录 WSL2 x86_64 的真实结果；Windows 能力不足明确降级，arm64 未执行不得伪报通过 |

前端新增依赖分别负责服务端缓存、表单验证、虚拟列表、图表与计划要求的测试/Mock；后端优先使用 Go 标准库、已有 pgx 和 x/sys。
