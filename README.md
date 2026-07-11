# ZX Panel

ZX Panel 是一个混合脚手架项目：前端使用 Vite + React + TypeScript，后端使用 Go + Gin。当前仓库重点是前端单页应用骨架和一个最小可运行的后端 API server。

## 当前状态

- 前端已切换为 Vite SPA，不再使用 Next.js App Router。
- 前端入口为 `index.html`、`src/main.tsx` 和 `src/App.tsx`。
- 当前保留的前端路径语义：`/`、`/nginx`、`/nginx/index`。
- 后端已有 Gin server 骨架，提供健康检查和 ping 接口。
- 前后端尚未建立完整 API 客户端/服务端集成契约。

## 环境要求

- Node.js：`^22.22.0 || >=24.0.0`
- pnpm：`>=10.0.0`
- Go：`1.25.0`
- Docker Engine / Docker Desktop：支持 Docker Compose v2（使用 `docker compose` 命令）
- SQLite CLI：后端启动会检查全局 `sqlite3` 命令；若根目录缺少 `system.sqlite`，会使用它创建运行时数据库。

## 快速开始

安装前端依赖：

```bash
pnpm install
```

启动前端开发服务器：

```bash
pnpm dev
```

Vite 开发地址为 [http://localhost:6500](http://localhost:6500)。`vite.config.ts` 启用了 `strictPort`，如果端口被占用会直接报错。

启动后端服务器：

```bash
go run ./cmd/server
```

默认后端地址为 `http://localhost:25000`，可通过 `PORT` 环境变量覆盖端口。

## Redis 与 PostgreSQL

项目根目录的 `compose.yaml` 提供 Redis 和 PostgreSQL 开发环境。配置使用 Docker 命名卷持久化数据，不依赖 Linux/Windows 的宿主机绝对路径，可用于 Linux Docker Engine 和 Windows Docker Desktop 的 Linux 容器模式。

首次启动前复制环境变量示例：

Linux/macOS：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

请至少修改 `.env` 中的 `POSTGRES_PASSWORD` 和 `REDIS_PASSWORD`，然后启动服务：

```bash
docker compose up -d
docker compose ps
```

默认连接信息：

| 服务 | 宿主机地址 | 容器内地址 | 默认数据库/用户 |
|------|------------|------------|-----------------|
| PostgreSQL | `127.0.0.1:5432` | `postgres:5432` | 数据库 `zx_panel`，用户 `zx_panel` |
| Redis | `127.0.0.1:6379` | `redis:6379` | 使用 `REDIS_PASSWORD` 认证 |

停止容器但保留数据：

```bash
docker compose down
```

停止容器并删除 PostgreSQL、Redis 数据卷：

```bash
docker compose down -v
```

默认端口只绑定到 `127.0.0.1`，避免数据库意外暴露到局域网。确需从其他主机连接时，可在 `.env` 中设置 `DOCKER_BIND_HOST=0.0.0.0`，同时应使用强密码并配置主机防火墙。当前 Go 后端尚未接入这两个服务；后续接入时，容器间连接应使用表格中的服务名，不要硬编码宿主机地址。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 构建前端生产产物到 `dist/` |
| `pnpm start` | 使用 Vite preview 预览构建结果 |
| `pnpm preview` | 同 `pnpm start` |
| `pnpm lint` | 运行 ESLint |
| `pnpm lint:fix` | 自动修复可修复的 ESLint 问题 |
| `go run ./cmd/server` | 启动 Go/Gin 后端服务 |
| `go test ./...` | 运行 Go 测试 |
| `docker compose up -d` | 后台启动 PostgreSQL 与 Redis |
| `docker compose down` | 停止数据服务并保留命名卷 |

## 项目结构

```text
.
├── index.html              # Vite HTML 入口
├── src/
│   ├── main.tsx            # React 挂载入口
│   ├── App.tsx             # 当前 SPA shell 与路径分发
│   ├── styles.scss         # 全局样式
│   └── theme/              # 主题上下文与 Ant Design 主题配置
├── cmd/server/main.go      # 后端服务入口
├── internal/
│   ├── api/router.go       # Gin 路由
│   ├── config/server.go    # 服务配置
│   └── server/run.go       # HTTP server 启动逻辑
├── learn/                  # Go 学习/demo 代码
├── docker/redis/redis.conf # Redis 持久化配置
├── compose.yaml            # PostgreSQL 与 Redis 容器编排
├── .env.example            # Docker 开发环境变量示例
├── vite.config.ts          # Vite 配置
├── tsconfig.json           # TypeScript 配置
└── eslint.config.mjs       # ESLint flat config
```

## 前端说明

当前前端没有引入正式路由库，而是在 `src/App.tsx` 中基于 `window.location.pathname` 做简单路径分发。

已映射路径：

- `/`
- `/nginx`
- `/nginx/index`

如果生产环境需要直接访问 `/nginx` 或 `/nginx/index`，静态服务器需要将未知请求回退到 `index.html`。

## 后端接口

后端默认监听 `25000` 端口。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/healthz` | 健康检查，返回 `status: "ok"` |
| `GET` | `/api/v1/ping` | 连通性检查，返回 `message: "pong"` |

响应结构当前统一为：

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

## 后端安全基线

后端 Gin 路由默认启用 `internal/security` 中间件，提供基础输入防护：

- 请求体默认限制为 1 MiB。
- `GET`、`DELETE` 请求会扫描 query 参数。
- `POST`、`PUT`、`PATCH` 请求会扫描 query、JSON、URL encoded form 和 multipart form 字段。
- 中间件会拒绝明显 SQL、NoSQL 和命令注入形态的输入，并返回统一错误结构：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_INPUT",
    "message": "request contains unsafe input"
  }
}
```

新增 handler 绑定 DTO 时应优先使用 `security.BindJSON(c, &dto)` 或 `security.BindQuery(c, &dto)`，它们会复用 Gin 的 `binding` 校验标签，并在绑定后清洗字符串字段。该安全层是基础防线，不能替代 SQL 参数化查询、Mongo 安全 filter 构造或命令 allowlist 校验；涉及命令执行时应使用固定命令名和 `security.LookPathAllowed` 这类 allowlist helper，禁止拼接用户输入到 shell 命令中。

## 开发约定

- 前端使用 TypeScript、React 函数组件和 Hooks。
- 路径别名 `@/*` 指向 `src/*`。
- 样式沿用 `src/styles.scss` 中的 SCSS/全局 class 方式。
- UI 控件优先使用已安装的 Ant Design。
- 后端新增可运行逻辑放在 `cmd/server`，可复用业务代码放在 `internal/*`。
- 不要硬编码环境相关 URL；新增前后端集成时优先使用环境变量或配置。
- 提交信息使用 Conventional Commits，例如 `feat: add nginx page`、`fix: handle api error`、`docs: update readme`。
