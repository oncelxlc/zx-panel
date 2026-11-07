# 本地开发：在 WSL 中运行后端

本文使用 Windows 上的仓库 `E:\Github\zx-panel`，对应 WSL 路径 `/mnt/e/Github/zx-panel`。仓库位置不同时替换命令中的路径。推荐前端在 Windows 运行，Go 后端在 WSL 运行；浏览器统一访问 `http://localhost:7200`。

后端管理的是当前 WSL 环境。开发启动不自动准备数据库、迁移 schema 或创建管理员，也不自动启用 helper。

## 1. 环境要求

| 位置 | 要求 |
| --- | --- |
| Windows | WSL2 和已安装的 Linux 发行版；Node `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`、pnpm `>=10.0.0` |
| WSL | 非 root 用户、Linux Go `1.26.0+`、Bash、`setsid`（util-linux 提供） |
| 数据库 | WSL 能连接的独立开发 PostgreSQL；仓库 Compose 使用 PostgreSQL 18，默认端口 `25432` |

Windows 调用 `pnpm dev:backend:wsl` 不需要 WSL 内安装 Node.js/pnpm。只有直接在 WSL 调用 pnpm 或运行前端时，才需要 Linux Node.js/pnpm。完整应用管理还需要 systemd 与单独配置的 helper，普通 API 联调可以先保持 helper 关闭。

在 **Windows PowerShell** 检查环境并进入 WSL：

```powershell
Set-Location E:\Github\zx-panel
node --version
pnpm --version
wsl --list --verbose
wsl --cd E:\Github\zx-panel\backend --exec bash -il
```

上面的 `wsl` 命令使用默认发行版和用户。若要指定发行版，可用 `wsl -d 发行版名称 --cd E:\Github\zx-panel\backend --exec bash -il`，再使用本文的直接 Go 命令；pnpm 启动脚本从 Windows 调用时始终使用默认发行版。

在打开的 **WSL Bash** 中检查：

```bash
pwd
id -u
command -v go
command -v setsid
go version
go env GOHOSTOS GOOS GOARCH
```

工作目录应为 `/mnt/e/Github/zx-panel/backend`，UID 不能为 `0`，`GOHOSTOS` 和 `GOOS` 都应为 `linux`。不要使用 Windows Go 或 `sudo go run` 启动 Web 后端。

## 2. 首次准备配置和数据库

### 2.1 创建本地配置

以下命令在 **WSL 的 `backend/` 目录** 执行；已存在的配置会保留：

```bash
cd /mnt/e/Github/zx-panel/backend
test -f .env || cp .env.example .env
test -f configs/dev.json || cp configs/dev.example.json configs/dev.json
printf '%s\n' "$HOME"
```

用编辑器填写 `backend/.env` 的数据库连接信息。使用仓库 Compose 的本地示例为：

```dotenv
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=25432
POSTGRES_DB=zx_panel
POSTGRES_USER=zx_panel
POSTGRES_PASSWORD=replace_with_your_local_password
POSTGRES_SSLMODE=disable
```

把密码占位值改为自己的开发密码。`127.0.0.1` 必须是 **WSL 内可达的数据库地址**；数据库运行位置不同则按实际情况填写。若设置了 `DATABASE_URL`，后端优先使用它，不再使用上述分字段连接信息。Compose 仍使用 `POSTGRES_*`，两边必须指向同一个开发库。保留示例中的 `REDIS_PASSWORD` 配置项，Compose 解析文件时需要它；只启动 PostgreSQL 即可，面板不依赖 Redis。

`configs/dev.json` 保持 `mode: development` 和 `privileged.enabled: false`，将其中的整个 `paths` 对象替换为：

```json
{
  "dataRoot": "/home/WSL_USER/.local/share/zx-panel-dev",
  "runtimeRoot": "/home/WSL_USER/.local/share/zx-panel-dev/runtimes",
  "stagingRoot": "/home/WSL_USER/.local/share/zx-panel-dev/staging",
  "artifactCacheRoot": "/home/WSL_USER/.local/share/zx-panel-dev/cache/artifacts",
  "exportRoot": "/home/WSL_USER/.local/share/zx-panel-dev/exports",
  "appRoots": ["/home/WSL_USER/.local/share/zx-panel-dev/apps"],
  "secretKeyFile": "/home/WSL_USER/.local/share/zx-panel-dev/keys/app-secrets.key"
}
```

用前面打印的实际 home 路径替换 `/home/WSL_USER`。JSON 不展开 `$HOME` 或 `~`。密钥和数据放在 WSL 文件系统，避免 `/mnt/e` 等 Windows 挂载盘的权限差异；已有配置关联的数据和密钥必须继续使用，不能更换路径后生成新密钥来代替旧密钥。

首次使用上述新目录时，在 **WSL** 创建数据和密钥目录：

```bash
install -d -m 0700 "$HOME/.local/share/zx-panel-dev"
install -d -m 0700 "$HOME/.local/share/zx-panel-dev/keys"
```

开发服务首次启动时，如果数据库没有加密业务数据，会创建缺失的密钥；密钥文件必须为 `0600`。已有密钥应单独备份并保留，不能通过删除密钥解决启动错误。

配置位置与优先级：

- `.env` 从进程工作目录读取；本文统一在 `backend/` 执行 Go 命令。
- `--config configs/dev.json` 相对于工作目录；JSON 中的相对 `paths` 则相对于 JSON 所在目录。
- 开发模式先加载 JSON，再读取可选 `.env` 并应用环境覆盖；已存在的进程环境变量不会被 `.env` 覆盖。
- 监听地址可由 `PORT`、`ZX_PANEL_LISTEN` 覆盖，后者优先；`ZX_PANEL_PUBLIC_ORIGIN`、`ZX_PANEL_LOG_LEVEL` 也支持覆盖。本文保留 API `25000`、Vite `7200`。
- `backend/.env`、`backend/configs/dev.json` 已被 Git 忽略。不要把本地凭据写进示例文件。

### 2.2 启动 PostgreSQL

已有可用的独立开发数据库可跳过本步。使用仓库 Compose 时，先确保 Docker 可用，在 **Windows PowerShell 的仓库根目录** 执行：

```powershell
Set-Location E:\Github\zx-panel
docker compose --env-file backend/.env -f backend/compose.yaml up -d postgres
docker compose --env-file backend/.env -f backend/compose.yaml ps postgres
```

等待 PostgreSQL 显示健康，再继续迁移。若后续 WSL 连接失败，核对 Docker/WSL 网络和 `.env` 中的实际地址。已有数据库卷不会因为修改 `.env` 而自动修改账号密码；应使用已有凭据，不要删除卷重建。

### 2.3 检查配置并初始化空库

在 **WSL 的 `backend/` 目录** 执行：

```bash
go run -tags devassets ./cmd/server check-config --config configs/dev.json
```

`check-config` 只检查配置格式和约束，不连接数据库，也不验证密钥文件权限。

**只有首次准备空的开发数据库时**，执行：

```bash
go run -tags devassets ./cmd/server migrate up --config configs/dev.json
go run -tags devassets ./cmd/server setup-token --config configs/dev.json
```

保存终端输出的一次性初始化凭据，有效期为 10 分钟。启动前后端后，打开 `http://localhost:7200/setup`，填写凭据并创建管理员。过期后可重新运行 `setup-token`。当前服务不会根据 `.env` 中旧的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 自动创建默认管理员。

**已有账号时**跳过初始化，先用以下命令检查 schema；需要升级时按第 6 节操作：

```bash
go run -tags devassets ./cmd/server migrate status --config configs/dev.json
```

## 3. 日常启动：选择一种方式

同一个数据库只运行一个后端实例，以下方式不要同时执行。

### 方式 A：Windows 分别启动后端和前端

在 **Windows PowerShell** 启动 WSL 后端：

```powershell
Set-Location E:\Github\zx-panel
pnpm dev:backend:wsl
```

无参数启动会自动使用已存在的 `backend/configs/dev.json`。需要显式指定配置时：

```powershell
pnpm dev:backend:wsl --config configs/dev.json
```

另开一个 **Windows PowerShell** 终端启动前端：

```powershell
Set-Location E:\Github\zx-panel
# 首次安装或锁文件更新后执行
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` 使用真实 API；若本地 `frontend/.env` 有覆盖，确认 `VITE_DATA_MODE=api`，`VITE_API_BASE_URL` 留空或不设置。浏览器访问 `http://localhost:7200`，Vite 把 `/api` 代理到 `http://127.0.0.1:25000`。

### 方式 B：直接在 WSL 运行 Go

不需要 WSL Node.js/pnpm。在 **WSL** 执行：

```bash
cd /mnt/e/Github/zx-panel/backend
go run -tags devassets ./cmd/server serve --config configs/dev.json
```

前端仍在另一个 Windows 终端运行 `pnpm dev`。直接 Go 命令不会自动读取 `configs/dev.json`，必须保留 `--config`。

如果已在 WSL 安装 Linux Node.js/pnpm，也可在 **WSL 仓库根目录** 使用 `pnpm dev:backend:wsl`。运行 WSL 前端则需独立的 Linux `node_modules`，不要用 Windows 安装的依赖；本指南默认前端留在 Windows。

### 方式 C：Windows 一条命令启动前后端

完成数据库、配置、迁移和 Windows 前端依赖安装后，在 **Windows PowerShell** 执行：

```powershell
Set-Location E:\Github\zx-panel
pnpm dev:all
```

它启动 Windows Vite 和默认 WSL 发行版中的 Go 后端；已存在的 `backend/configs/dev.json` 会自动加载。联合命令仅支持在 Windows 运行，附加参数传给 Vite，不传给后端。

### 启动、停止和代码更新

- pnpm WSL 命令加载交互式登录 Bash，并在每次调用时补充查找常见 Go 安装目录；不会修改 shell 配置。
- Linux/WSL 的 `devassets` 开发服务每次启动前都会编译 `backend/build/wsl/zx-panel-helper`。构建失败则停止启动；编译成功不代表已启动、安装或启用了 helper。
- `devassets` 不内嵌前端，页面由 Vite 提供；日常后端开发无需先构建前端发布资源。
- Go 源码修改后需 Ctrl+C 停止并重新执行启动命令；当前后端命令不提供自动热重启。
- 独立命令的 Ctrl+C 只清理该命令启动的服务。`pnpm dev:all` 中任一服务退出会停止另一侧；Ctrl+C 同时停止两侧，WSL 脚本最多等待 40 秒排空。数据库容器不会随之停止。

## 4. 按部件单独运行和测试

各部件是独立进程，按本次开发需要选择：

| 目标 | 启动方式 | 依赖与边界 |
| --- | --- | --- |
| 只开发前端页面 | Windows 仓库根目录 `pnpm dev:mock` | 固定 MSW 数据，不需要 Go、helper 或 PostgreSQL，不操作主机 |
| 只启动真实 API 前端 | Windows 仓库根目录 `pnpm dev` | 只启动 Vite；页面请求需要另行运行 Go API |
| 只启动 Go Web API | Windows 仓库根目录 `pnpm dev:backend:wsl`，或第 3 节的直接 Go 命令 | 需要已迁移的 PostgreSQL；关闭 helper 时可进行不涉及特权管理的 API 联调，不需要 Vite |
| 只启动 helper | WSL 中构建 `./cmd/helper`，再以 root 运行二进制，见下文 | 不需要 Web、Vite、PostgreSQL 或加密密钥；使用独立 Unix Socket，无 HTTP 端口 |
| 只启动 PostgreSQL | 第 2.2 节的 `docker compose ... up -d postgres` | 不会启动 Web、helper、Vite 或 Redis |

`pnpm dev:backend:wsl` 启动的是 Web API；虽然它会编译 helper，但不会运行 helper。仓库当前没有单独的 pnpm helper 启动脚本。

### 4.1 只运行前端或数据库

只开发页面时，在 **Windows PowerShell 的仓库根目录** 执行：

```powershell
pnpm dev:mock
```

打开 `http://localhost:7200`。与 `pnpm dev` 共用 7200 端口，两种模式不要同时启动；Ctrl+C 停止。需要切回真实 API 联调时，先停止 Mock，再运行 `pnpm dev` 并单独启动后端。

只查看数据库日志或停止数据库时，在 **Windows 仓库根目录** 执行：

```powershell
docker compose --env-file backend/.env -f backend/compose.yaml logs --tail 100 postgres
docker compose --env-file backend/.env -f backend/compose.yaml stop postgres
```

`stop postgres` 保留数据库卷，但会中断正在使用它的后端；先停止对应 Web 服务。日常停止不需要删除容器卷。

### 4.2 只测试 helper 代码，不启动 root 进程

在 **WSL 非 root 用户的 `backend/` 目录** 执行：

```bash
cd /mnt/e/Github/zx-panel/backend
env -u ZX_PANEL_RUNTIME_JOB_TEST go test -count=1 ./internal/host
```

这组测试不需要 PostgreSQL、Web 或正在运行的 helper。默认覆盖协议边界相关逻辑、unit 参数、运行时来源与权限检查；部分用例只读本机 dpkg/Go 安装信息或使用临时目录。`env -u` 明确关闭需要 root 的可选 systemd 作业测试，不执行真实包卸载。Linux 专用测试在 Windows 原生 Go 下不会运行，因此应在 WSL 执行。

只验证 unit 与运行时参数边界时，可缩小范围：

```bash
go test -count=1 ./internal/host \
  -run '^(TestUnitAndRuntimeBoundaries|TestJournalCursorArguments|TestRuntimeRemovalCommand)$'
```

### 4.3 只启动 zx-panel-helper，检查 Socket 协议

下面是在专用开发 WSL 中手动启动前台 helper 的流程，只发送只读 `probe`。**前台 sudo 运行不会自动套用 `deploy/zx-panel-helper.service` 的 systemd 沙箱**；它适合本地开发排查，不能替代部署模板验收。

helper 启动本身会检查并在缺失时创建运行时目录及 `node/`、`go/` 子目录、`/etc/zx-panel/apps`、`/etc/systemd/system` 和 Socket 父目录。示例使用独立的运行时目录与 Socket，但固定的 `/etc` 目录仍与本机共享，不是完全隔离的模拟服务。

#### 第一步：检查 WSL 并构建

在 **WSL 非 root 用户的 `backend/` 目录** 执行：

```bash
cd /mnt/e/Github/zx-panel/backend
id -u
getent passwd nobody
ps -p 1 -o comm=
test -d /run/systemd/system
test -x /usr/bin/systemd-run
command -v python3
mkdir -p build/wsl
go build -mod=readonly -o build/wsl/zx-panel-helper-dev ./cmd/helper
```

记录 `id -u` 输出，作为后续配置中的 `panelUid`。`probe` 要求 WSL 已启用 systemd、`/usr/bin/systemd-run` 可执行，并且 helper 可写 `/usr/local/bin`。这里用 Python 3 标准库做 Socket 检查，不需要额外 Python 包。

helper 不依赖前端资源，无需 `-tags devassets`。使用单独的 `zx-panel-helper-dev` 文件名，避免与 Web 启动时自动生成的 `zx-panel-helper` 混淆；构建用普通用户，只有运行 helper 时使用 sudo。

#### 第二步：准备专用 helper 配置

用编辑器新建 **`backend/build/wsl/helper-dev.json`**，填入以下完整 JSON。`backend/build/` 已被 Git 忽略；此文件不需要数据库连接信息，也不会读取 `backend/.env`：

```json
{
  "mode": "development",
  "paths": {
    "dataRoot": "/var/lib/zx-panel-helper-dev",
    "runtimeRoot": "/opt/zx-panel-helper-dev/runtimes",
    "stagingRoot": "/var/lib/zx-panel-helper-dev/staging",
    "artifactCacheRoot": "/var/lib/zx-panel-helper-dev/cache/artifacts",
    "exportRoot": "/var/lib/zx-panel-helper-dev/exports",
    "appRoots": ["/srv/zx-panel-helper-dev/apps"],
    "secretKeyFile": "/var/lib/zx-panel-helper-dev/keys/app-secrets.key"
  },
  "privileged": {
    "enabled": true,
    "socketPath": "/run/zx-panel-helper-dev/control.sock",
    "panelUid": 1000,
    "serviceAccounts": ["nobody"]
  },
  "logLevel": "info"
}
```

将 `1000` 替换为第一步得到的实际非 root UID。`serviceAccounts` 必须非空；本例使用已存在的 `nobody` 以满足配置约束，`probe` 不会启动该账号的进程。真实应用测试应另行配置专用应用账号，且不能使用 root 或 `panelUid` 对应的 Web 账号。

必须保留以下边界：

- 普通 `configs/dev.json` 默认关闭 helper，且本文前面将运行时目录放在用户 home；不能直接拿它启动 helper。`runtimeRoot` 及全部父目录必须归 root 所有，不能为符号链接，也不能允许组或其他用户写入。本例 `/opt/zx-panel-helper-dev/runtimes` 由 helper 校验后创建，不要先用普通用户创建，也不要递归修改现有目录权限来绕过检查。
- Socket 父目录必须归 root 所有，且不能允许组或其他用户写入；helper 会创建 Socket、设为 `0600` 并将其所有者设为 `panelUid`。
- 示例的其他数据路径只用于提供互不冲突的配置；只运行 `probe` 不会建立数据库、生成密钥、安装运行时或创建应用。
- HTTP 字段沿用默认开发配置以通过公共配置校验，helper 实际不监听 HTTP。helper 没有 `serve`、`check-config` 或 `setup-token` 子命令，只接受自身的 `--config` 参数；省略时默认读取 `/etc/zx-panel/config.json`，开发时应显式指定。

#### 第三步：前台启动

在同一个 **WSL `backend/` 终端** 执行：

```bash
sudo ./build/wsl/zx-panel-helper-dev --config ./build/wsl/helper-dev.json
```

保持这个终端运行。无需同时启动 Go Web、Vite 或 PostgreSQL；没有请求时可能没有日志，需用下面的 Socket 检查确认就绪。

#### 第四步：以获准用户发送只读 probe

另开一个 **WSL 终端**，使用配置中的 `panelUid` 对应用户执行，**不要加 sudo**。协议是以换行结束的 JSON，不是 HTTP，不能用 `curl --unix-socket ... http://...` 探测。

```bash
id -u
stat -c '%U %u %a %n' /run/zx-panel-helper-dev/control.sock
python3 - <<'PY'
import json
import socket

with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
    connection.settimeout(5)
    connection.connect("/run/zx-panel-helper-dev/control.sock")
    connection.sendall(b'{"action":"probe","id":""}\n')
    with connection.makefile("rb") as response:
        result = json.loads(response.readline(65537))

print(json.dumps(result, ensure_ascii=False))
assert result.get("ok") is True and result.get("protocolVersion") == 2, result
PY
```

预期返回 `{"protocolVersion": 2, "ok": true}`，字段顺序不影响结果。Socket 权限应为 `600`，UID 应与配置一致。不要在发送后提前关闭写方向，服务端会将断开连接视为取消请求。

root 或其他 UID 即使能接触 Socket，也不会通过 `SO_PEERCRED` 校验。`HOST_ACTION_FAILED` 应结合 helper 终端日志检查 systemd、`systemd-run` 和 `/usr/local/bin` 的写权限；连接拒绝或 Socket 不存在则先查看启动终端错误。

`probe` 只证明这个进程的基础能力检查和当前用户的 Socket 通信通过，不验证所有管理动作、跨账号进程引用检查或正式服务沙箱。

#### 第五步：停止、修改和重启

在运行 `sudo ./build/wsl/zx-panel-helper-dev ...` 的终端按 Ctrl+C。修改 helper 源码后先停止旧进程，重新执行第一步的 `go build` 和第三步的启动命令；没有自动热重载。正常退出会关闭 Socket，已创建的开发目录会保留。

若要进一步与 Web 联调，在 Web 的 `configs/dev.json` 中启用 `privileged.enabled`，配置相同的 `socketPath`、`panelUid`、`serviceAccounts` 和 `runtimeRoot`，并确保两侧 `stagingRoot`、`appRoots` 指向相同实际目录。Web 继续使用已有开发数据库、数据目录和密钥，以该 `panelUid` 对应的非 root 用户重启。不要把本节用于独立探测的整份配置直接覆盖 Web 配置；安装与应用动作还需按部署要求准备目录访问权限和专用应用账号。

## 5. 验证是否启动成功

在另一个 **WSL 终端** 检查后端：

```bash
curl -fsS http://127.0.0.1:25000/healthz
```

正常响应包含 `"success": true` 和 `"data": {"status": "ok"}`。

在 **Windows PowerShell** 检查 localhost 转发和 Vite 代理：

```powershell
Test-NetConnection 127.0.0.1 -Port 25000
Invoke-RestMethod http://localhost:7200/api/v1/setup/status
```

首次初始化前，`data.setupRequired` 为 `true`；管理员创建后为 `false`。然后通过 `http://localhost:7200/setup` 或 `http://localhost:7200/login` 进入页面。

## 6. 已有开发数据库升级

先停止连接同一数据库的后端。WSL 中需要可用的 `pg_dump`，其版本不能低于数据库版本；Compose 的 PostgreSQL 18 需要相应客户端。当前本地客户端适配说明见[开发环境启动验证](verification.md#2026-10-01-开发环境启动验证)。

在 **WSL 的 `backend/` 目录** 执行，确保备份目录已存在，并使用尚不存在的新文件名：

```bash
pg_dump --version
go run -tags devassets ./cmd/server migrate up --config configs/dev.json \
  --backup "$HOME/.local/share/zx-panel-dev/before-migrate-$(date +%Y%m%d-%H%M%S).dump"
go run -tags devassets ./cmd/server migrate status --config configs/dev.json
```

`--backup` 由命令先导出新备份，再执行迁移。备份失败会阻止迁移；数据库备份不包含加密密钥，密钥需单独保存。不要删除数据库或修改已应用的 SQL 迁移来绕过 schema 检查。

也可在 **Windows 仓库根目录** 通过同一个启动器执行维护命令，例如：

```powershell
pnpm dev:backend:wsl check-config --config configs/dev.json
pnpm dev:backend:wsl migrate status --config configs/dev.json
```

**显式子命令必须自行传入 `--config configs/dev.json`**，包括 `serve`、`migrate`、`setup-token`、`backup`；相对路径以 WSL 的 `backend/` 为基准，不是 Windows 仓库根目录。

## 7. 常见问题

| 现象 | 处理 |
| --- | --- |
| 找不到 Go、Go 版本过低或 `GOOS` 错误 | 在目标 WSL 用户下检查 `command -v go`、`go version`、`go env GOHOSTOS GOOS`，使用 Linux Go 1.26+，修正交叉编译环境设置 |
| 提示不能使用 root | 使用 WSL 非 root 用户运行 Web；不要加 `sudo` 绕过检查 |
| `database unavailable` / `PostgreSQL connection unavailable` | 检查数据库健康、WSL 可达地址、账号密码以及是否有 `DATABASE_URL` 覆盖；`check-config` 成功不代表连接成功 |
| `schema unavailable` / `schema is behind` | 空库按第 2 节迁移；已有账号按第 6 节先备份再迁移 |
| 端口占用或实例锁冲突 | 停止同一配置、数据目录或数据库上的旧后端；不要删除锁文件绕过保护 |
| 密钥或目录权限错误 | 核对 `paths` 使用 WSL 绝对路径、当前用户和目录权限，保留原密钥；密钥目录 `0700`、密钥文件 `0600` |
| `build development helper failed` | 确认工作目录是 `backend/`，仓库含 `cmd/helper`，Linux Go 可用，并查看前面的编译错误 |
| Vite `/api` 连接失败 | 先验证 WSL `/healthz`，再检查 Windows 到 WSL 的 localhost 转发；默认代理固定访问 `127.0.0.1:25000` |
| 登录或写操作出现 Host/Origin 拒绝 | 使用配置中的 `http://localhost:7200`；自定义端口时同步调整 `publicOrigin`、`allowedHosts`，修改 API 端口还需同步 Vite 代理 |
| 页面提示 helper 未启用或不可用 | 默认配置关闭管理权限，这是预期边界；编译 helper 不会启用它，需要管理员另行配置，Web 后端仍须非 root |
| helper 报 `helper directories and ancestors must be root owned` | 检查运行时目录及全部父目录；不能使用用户 home 下的运行时目录，独立配置见第 4.3 节 |
| helper 已启动，但探测连接被关闭 | 确认探测进程的 UID 等于 `panelUid`、没有使用 sudo，且发送的是换行结束的原始 JSON |
| helper 报 `helper already running` | 同一 Socket 已有进程监听；停止对应旧进程或为本次测试选择独立 Socket，不要直接删除正在使用的 Socket |

需要二进制构建、GoLand 断点或 Delve 调试时，继续阅读 [WSL Go 构建与 GoLand 调试](wsl-go-debug.md)。helper 的部署与权限要求见 [README](../README.md#linux-部署) 和[权限决定](helper-permission-decision.md)。

本文命令按当前仓库脚本与源码核对；文档更新不代表已在当前机器重新执行迁移、启动服务或完成运行验收。
