# zx-panel v1.1

单机 Linux 服务器管理面板。Vite + React + TypeScript / shadcn Base UI + Nova，Go + Gin / PostgreSQL。管理目标始终是面板所在机器。

已实现六个主页面、Cookie/CSRF 认证、共享监控采集、持久任务、Node.js / Go 安装、systemd 托管应用和有界日志。Ubuntu 24.04 WSL2 x86_64 及 WSL 内 QEMU ARM64 系统模拟已实测官方安装、应用生命周期、权限边界、SSE 恢复，以及正式 helper 模板下的完整引用检查和卸载；x86_64 另通过 Linux race、PostgreSQL 恢复、30 分钟稳定性和实际导出上限。**M0–M5 已完成本次约定的本地与 WSL/QEMU 验收。** 正式 helper 模板已按明确授权完成双架构复验，实验配置已恢复、服务及虚拟机已停止，旧版本和应用保留。最新实测、模拟环境边界和限制见 [验证记录](docs/verification.md) 与 [Linux 验收清单](docs/linux-acceptance.md)。

## 开发

需要 Node `^22.22.0 || >=24.0.0`、pnpm、Go（模块最低 1.25，当前验证使用 1.27.1）及 PostgreSQL。Windows 支持开发与受限 API 预览；完整监控和管理需要原生 Linux + systemd。

```sh
pnpm install --frozen-lockfile
pnpm dev:mock
```

打开 http://localhost:7200 。Mock 明确展示“演示数据”，使用固定数据与时间，不操作主机。`?scenario=empty` 可选择异常场景：`setup`、`empty`、`offline`、`unsupported`、`permission-denied`、`in-use`、`disk-full`、`checksum-failure`、`task-interrupted`、`stale`、`warming-up`、`log-flood`、`long-path`、`session-expired`、`history-short`、`plan-expired`、`stream-disconnected`。也可设置 `VITE_MOCK_SCENARIO`。该模块不会进入 API 发布构建。

真实 API 开发使用同源代理，不能同时混用 Mock：

```sh
# 先复制 .env.example 为 .env，填写独立开发数据库凭据。
# compose.yaml 的 Redis 是原有可选服务；面板不使用 Redis。
docker compose up -d postgres
# 空数据库首次迁移：
go run -tags devassets ./cmd/server migrate up
# 打印一次性本机初始化凭据（有效 10 分钟）：
go run -tags devassets ./cmd/server setup-token
go run -tags devassets ./cmd/server
# 另一个终端：
pnpm dev
```

后端默认 `127.0.0.1:25000`，Vite 固定 7200。开发时显式使用 `devassets`；正式 Go 构建先执行 `pnpm build:release`，缺失真实 API 前端资源会构建失败。

**已有账号的数据库升级必须先停服务并提供新备份路径：**

```sh
go run -tags devassets ./cmd/server migrate up --backup ./before-v1.1.dump
```

升级保留账号及密码摘要，撤销旧 Bearer 会话。Web 启动只检查 schema，不自动迁移、不创建默认管理员。安装官方 `pg_dump` 客户端才能运行备份或带旧账号的迁移；备份文件不能已存在。本地 `.env`、开发配置、独立加密密钥和数据目录均被 Git 忽略。

## 配置与运行边界

配置参考 [生产示例](configs/production.example.json)。相对路径以配置文件目录为基准。环境变量覆盖：`DATABASE_URL`、`ZX_PANEL_LISTEN`、`ZX_PANEL_PUBLIC_ORIGIN`、`ZX_PANEL_LOG_LEVEL`；开发模式支持 `PORT` 和当前目录的可选 `.env`。生产模式不读取当前目录 `.env`，必须显式提供 PostgreSQL 连接串、HTTPS `publicOrigin`、精确 `allowedHosts` 与可信代理列表。

- HttpOnly / SameSite=Strict Cookie；生产 Secure + `__Host-` 前缀。预登录 CSRF、登录轮换、注销、改密撤销会话；不把认证秘密放进浏览器存储。
- Web 进程必须非 root；helper 使用 Unix Socket + SO_PEERCRED，只信任配置的 panel UID。应用账号不能是 root 或 Web 账号。
- helper 不连接 PostgreSQL、不加载主服务 `.env` 或数据库环境文件。数据库凭据留在主服务环境，生产 JSON 不放数据库密码。
- 每个业务 schema 对应一台受管主机；本机文件锁和数据库 advisory lock 防止双实例。
- `internal/storage/migrations/*.sql` 按版本执行并校验摘要，已应用文件不可编辑；`.gitattributes` 固定 LF。
- 所有 JSON 写接口限制 1 MiB，拒绝未知/重复/大小写别名字段和多段 JSON；秘密与参数不通用 trim。
- 安装只接受固定官方 HTTPS 来源与 SHA-256；下载 ≤512 MiB、展开 ≤2 GiB / 100,000 项。运行时总配额 20 GiB、暂存 3 GiB、已验证缓存 2 GiB，导出总配额 500 MiB。磁盘空间不足不会自动删除安装。
- Node.js 25+ 官方包需要系统 `libatomic`；安装会以受限账号核对版本，未通过不提交。平台下限及来源见 [Node 官方构建说明](https://github.com/nodejs/node/blob/main/BUILDING.md)。
- 单 worker 串行执行变更。先预检、确认、持久受理，再执行与核验；断开浏览器不取消任务。恢复时只认 root 提交标记和数据库证据，不盲目重放。
- 新运行时保留旧版本与已有绑定；默认值只影响新建应用的预选。外部安装只读；默认、配置或进程引用、扫描不完整均阻止卸载。
- 正式 helper 使用已批准的 `CAP_SYS_PTRACE` 检查跨账号可执行文件引用，并过滤 ptrace、process_vm_readv/writev、kcmp。引用未知或不完整时仍禁止卸载；权限及验证边界见 [权限决定](docs/helper-permission-decision.md)。
- 新应用只登记并保持停止，保存配置不隐式重启。删除只移除登记/unit，保留项目文件和已有 journal。环境值 AES-GCM 加密，主密钥必须独立备份。
- 原始指标 2 秒共享采集、15 分钟环形缓冲；文件系统 15 秒采集；历史按 10 秒聚合保留最多 24 小时 / 128 MiB。未知和预热值为 null，历史缺口不插值。
- 主 SSE 一条，日志页最多再开一条日志流；失效立即关流。浏览器日志 ≤5,000 条 / 5 MiB；单条 ≤16 KiB，导出 ≤50 MiB、有效 10 分钟、绑定操作人。

## Linux 部署

```sh
pnpm release
```

产物在 `release/linux-amd64/`、`release/linux-arm64/`，包含主程序与 helper；SHA-256 在 `release/SHA256SUMS`。不需要在目标服务器安装 Node/Go 开发工具来运行面板。运行用户应用时需安装其具体运行时。每次重新构建都会把 `build-info.json` 的验收状态重置为 pending；本次发布包已标记 passed-wsl-qemu，其摘要与正式模板实测绑定在 [部署验收报告](docs/acceptance-deployment.json)。

`deploy/nginx.conf` 只对静态 JS/CSS 开启 gzip，保留 JSON、SSE 和日志下载的原编码；见 [Nginx gzip 文档](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)。WSL 冷缓存初始 JS 实测约 270 KiB，完整概览加图表约 373 KiB，详见 [逐资源记录](docs/performance-assets-wsl.json)。

在专用 Ubuntu 24.04 主机上由管理员完成以下步骤，先填真实数据库地址和域名：

```sh
sudo useradd --system --user-group --home-dir /var/lib/zx-panel --shell /usr/sbin/nologin zx-panel
sudo useradd --system --user-group --home-dir /srv/zx-apps --shell /usr/sbin/nologin zx-app
sudo install -m 0644 deploy/tmpfiles.conf /etc/tmpfiles.d/zx-panel.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/zx-panel.conf
sudo install -m 0755 release/linux-amd64/zx-panel /opt/zx-panel/zx-panel
sudo install -m 0755 release/linux-amd64/zx-panel-helper /opt/zx-panel/zx-panel-helper
sudo install -m 0640 -o root -g zx-panel configs/production.example.json /etc/zx-panel/config.json
sudo install -m 0600 deploy/database.env.example /etc/zx-panel/database.env
id -u zx-panel
sudoedit /etc/zx-panel/config.json /etc/zx-panel/database.env
```

在配置中设置实际 `privileged.panelUid`、`serviceAccounts: ["zx-app"]`、`enabled: true`。项目必须已经存在于批准的 `appRoots`，且服务账号能遍历目录并读取入口/执行二进制。运行时与所有父目录必须由 root 拥有且其他账号不可写，不能放进 Web 用户可写的父目录。

在 root 本机维护终端中加载受控环境，然后运行 CLI：

```sh
sudo -i
set -a
. /etc/zx-panel/database.env
set +a
/opt/zx-panel/zx-panel check-config --config /etc/zx-panel/config.json
# 仅空数据库；已有账号时加 --backup /安全目录/新的备份.dump
/opt/zx-panel/zx-panel migrate up --config /etc/zx-panel/config.json
sudo --preserve-env=DATABASE_URL -u zx-panel /opt/zx-panel/zx-panel init-key --config /etc/zx-panel/config.json
/opt/zx-panel/zx-panel setup-token --config /etc/zx-panel/config.json
exit
sudo install -m 0644 deploy/zx-panel.service deploy/zx-panel-helper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zx-panel-helper zx-panel
```

`init-key` 拒绝覆盖已有密钥。已有账号不运行 `setup-token`。将 [Nginx 示例](deploy/nginx.conf) 合入真实 HTTPS 站点，配置证书后检查并重载 Nginx；不要把 25000 直接开放到公网。SSE 必须关闭代理缓冲并保留足够读超时。公开访问 `/login` 或空库的 `/setup`。

升级时先停止 Web 服务，等待最多 150 秒排空；备份、迁移、替换二进制后再启动。数据库故障或实例锁丢失会停止受理。不能承诺只回滚二进制便兼容已升级 schema。

## 备份与恢复

```sh
/opt/zx-panel/zx-panel backup --config /etc/zx-panel/config.json --output /安全目录/新的备份.dump
```

命令使用 PostgreSQL 自定义格式，文件 0600，失败删除未完成文件；密码通过子进程环境传递。另行安全备份 `/etc/zx-panel/keys/app-secrets.key`，不要将它混入公开产物。应用目录及 journal 需按主机策略备份。

恢复使用 `pg_restore --exit-on-error --no-owner --no-privileges --dbname=新测试库 备份.dump`。先建立独立测试库、查询 `current_database()` 核实目标，再执行恢复；核对账号、schema 校验、任务与秘密解密后才能安排正式切换。缺失密钥无法恢复加密秘密。详见 [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html)。已在隔离 WSL 数据库验证恢复和独立密钥解密；没有对现有业务库执行恢复覆盖。

## 验证

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm test:login
pnpm test:theme
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:api
go test -tags devassets ./...
go vet -tags devassets ./...
node scripts/secret-scan.mjs
pnpm audit
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 -tags devassets ./...
```

`pnpm test:api` 构建正式内嵌前端并在随机隔离库验证初始化、登录、持久导出和跨标签改密撤销；测试后关闭服务并清理测试库。`ZX_PANEL_INTEGRATION=1` 启用随机独立数据库 Go 测试（账号需有 CREATEDB 权限）；任何 DDL 前强制核对实际数据库名。`ZX_PANEL_CONTRACT_FIXTURES=1` 同时输出非秘密响应到 `test-results/go-api.json`，再运行 `pnpm contract --check-go` 验证 Go DTO 与前端 Schema。安装了 pg_dump/pg_restore 时还执行隔离恢复测试。

Linux 执行 `go test -race -tags devassets ./...`。CI 已配置，但本轮没有在远端触发；CI 结果和真正的 systemd 主机验收是两件事。完整接口见 [OpenAPI](docs/openapi.json)，适配差异见 [决定记录](docs/decisions.md)。
