# WSL Go 构建与 GoLand 调试

本文针对 `./cmd/server` 后端开发。使用 WSL 内的 Linux Go 1.25+ 构建，在非 root 用户下运行；`devassets` 不内嵌前端，浏览器界面由另一个终端的 Vite 提供。完整发布流程见 [README 的 Linux 部署](../README.md#linux-部署)。

## 1. 进入 WSL 仓库目录

在 Windows PowerShell 中执行：

```powershell
wsl --list --verbose
wsl --cd E:\Github\zx-panel --exec bash -il
```

使用默认 WSL 发行版和用户；需要指定发行版时，在 `wsl` 后添加 `-d 发行版名称`。后续 `bash` 命令均在这个终端的仓库根目录执行。直接使用 WSL 终端时先运行 `cd /mnt/e/Github/zx-panel`。

```bash
id -u
go version
go env GOHOSTOS GOOS GOARCH GOROOT
```

UID 必须非零，`GOHOSTOS` 与 `GOOS` 应均为 `linux`。使用 Linux Go 并清除错误的交叉编译环境设置；构建默认采用当前 WSL 架构。登录交互式 Bash 会加载用户的工具 PATH，包括已有 Homebrew 配置。

## 2. 手动准备开发配置与数据库

已有 `.env` 和 `configs/dev.json` 时继续使用，首次准备时才复制：

```bash
test -f .env || cp .env.example .env
test -f configs/dev.json || cp configs/dev.example.json configs/dev.json
printf '%s\n' "$HOME"
```

用编辑器填写 `.env` 的独立开发 PostgreSQL 连接信息，确认 WSL 能访问数据库。`configs/dev.json` 保持 `mode: development`、`privileged.enabled: false`，将 `paths` 改为 WSL 用户目录中的绝对 Linux 路径，例如：

```json
"paths": {
  "dataRoot": "/home/WSL_USER/.local/share/zx-panel-dev",
  "runtimeRoot": "/home/WSL_USER/.local/share/zx-panel-dev/runtimes",
  "stagingRoot": "/home/WSL_USER/.local/share/zx-panel-dev/staging",
  "artifactCacheRoot": "/home/WSL_USER/.local/share/zx-panel-dev/cache/artifacts",
  "exportRoot": "/home/WSL_USER/.local/share/zx-panel-dev/exports",
  "appRoots": ["/home/WSL_USER/.local/share/zx-panel-dev/apps"],
  "secretKeyFile": "/home/WSL_USER/.local/share/zx-panel-dev/keys/app-secrets.key"
}
```

用上一步打印的实际 home 路径替换 `/home/WSL_USER`；JSON 不展开 `$HOME` 或 `~`。数据目录权限应为 0700，密钥为 0600；已有密钥必须保留。这些目录放在 WSL 文件系统，避免 Windows 挂载盘的权限差异。相对配置路径以 JSON 文件目录为基准，`.env` 则从进程工作目录读取，因此下面所有命令和 IDE 配置都使用仓库根目录。

数据库需单独启动。若使用仓库 Compose，在 Windows 仓库终端执行 `docker compose up -d postgres`，并核对 WSL 的连接地址；构建和调试命令不会自动启动数据库、迁移或创建管理员。

## 3. 用 Go 构建二进制

在 WSL 仓库根目录执行：

```bash
mkdir -p build/wsl
go build -mod=readonly -tags devassets -o build/wsl/zx-panel ./cmd/server
go build -mod=readonly -tags devassets -gcflags='all=-N -l' -o build/wsl/zx-panel-debug ./cmd/server
```

`zx-panel` 用于普通开发运行，`zx-panel-debug` 关闭优化和内联以便断点与变量查看。两者均为 Linux 二进制，输出目录 `build/` 已被 Git 忽略。调试构建保留源文件路径与符号；不要加入 `-trimpath` 或 `-ldflags='-s -w'`，也不要拿 `pnpm release` 的精简产物调试。每次修改 Go 代码后重新构建对应二进制。

先做无需数据库连接的检查：

```bash
./build/wsl/zx-panel version
./build/wsl/zx-panel check-config --config configs/dev.json
```

`check-config` 只校验配置，不证明数据库已启动或 schema 已迁移。

### 首次初始化或升级（按实际状态选择）

仅首次准备空的开发数据库时执行：

```bash
./build/wsl/zx-panel migrate up --config configs/dev.json
./build/wsl/zx-panel setup-token --config configs/dev.json
```

初始化凭据有效 10 分钟，启动服务后用于浏览器 `/setup`。已有账号不再执行 `setup-token`。

已有账号且需要升级 schema 时，先停止使用同一数据库的后端，再使用与数据库版本匹配的 `pg_dump`，并提供**尚不存在的新备份文件路径**：

```bash
./build/wsl/zx-panel migrate up --config configs/dev.json \
  --backup "$HOME/.local/share/zx-panel-dev/before-debug.dump"
```

每次升级改用新的备份文件名。当前本机 PostgreSQL 客户端适配器的使用方法见 [开发环境启动验证](verification.md#2026-10-01-开发环境启动验证)。已准备好的数据库可以用 `./build/wsl/zx-panel migrate status --config configs/dev.json` 只检查 schema。

### 普通运行

```bash
./build/wsl/zx-panel serve --config configs/dev.json
```

另开 Windows 仓库终端运行 `pnpm dev`，访问 `http://localhost:7200`。在另一个 WSL 终端执行 `curl -fsS http://127.0.0.1:25000/healthz` 可确认后端健康。Ctrl+C 停止本终端的后端；调试前先停止普通后端，同一数据库只允许运行一个实例。

## 4. GoLand 原生 WSL 调试

原生 WSL 集成由 GoLand 管理构建与调试器，无需手动安装 Delve。下面通过 WSL 路径打开当前仓库，文件仍是同一份：

1. 在 Windows GoLand 的 **File → Open** 中打开 `\\wsl.localhost\发行版名称\mnt\e\Github\zx-panel`，发行版名称以 `wsl --list --verbose` 为准。
2. 在 **Settings → Go → GOROOT** 中确认选中 WSL 的 Linux Go SDK；需要手动选择时，使用 `go env GOROOT` 对应的 WSL 路径。Homebrew 环境应使用实际输出路径。
3. 在 **Settings → Go → Build Tags** 的自定义标签中添加 `devassets`，让 IDE 正确索引开发构建文件。
4. 在 **Run → Edit Configurations → + → Go Build** 中填写：

| 字段 | 值 |
| --- | --- |
| Name | `WSL backend` |
| Run kind | `Package` |
| Package path | `zx-panel/cmd/server` |
| Working directory | `$PROJECT_DIR$` |
| Go tool arguments | `-mod=readonly -tags=devassets` |
| Program arguments | `serve --config configs/dev.json` |
| Run after build | 勾选 |
| Run with sudo | 不勾选 |

WSL 路径打开的工程中，`Local Machine` 表示该 WSL 环境。先在 `internal/server/cli.go` 的 `Main` 内设置断点，再点击 **Debug**，可检查启动流程；按 **Resume** 后服务才继续启动。调试期间另开 Windows 终端运行 `pnpm dev`，不要同时运行会另启后端的 `pnpm dev:all` 或 `pnpm dev:backend:wsl`。

需要调试已构建的 `zx-panel-debug`，或希望继续从 Windows 的 `E:\Github\zx-panel` 打开工程时，使用下一节。原生 WSL 与运行配置字段见 [JetBrains WSL 文档](https://www.jetbrains.com/help/go/how-to-use-wsl-development-environment-in-product.html) 和 [Go Build 文档](https://www.jetbrains.com/help/go/go-build.html)。

## 5. GoLand 连接 WSL 的 Delve

先完成第 3 节的调试构建。仅此方式需要在 WSL 手动安装 Delve，工具放在已忽略的构建目录，不添加项目依赖：

```bash
mkdir -p build/wsl/tools
GOBIN="$PWD/build/wsl/tools" go install github.com/go-delve/delve/cmd/dlv@latest
./build/wsl/tools/dlv version
```

在 WSL 仓库根目录启动调试器，由它启动自己的子进程：

```bash
./build/wsl/tools/dlv --listen=127.0.0.1:2345 --headless=true --api-version=2 \
  exec ./build/wsl/zx-panel-debug -- serve --config configs/dev.json
```

调试器仅监听本机回环 2345。看到监听提示后，程序会等待 IDE 连接；先设置断点，再在 Windows GoLand 中创建 **Run → Edit Configurations → + → Go Remote**：

| 字段 | 值 |
| --- | --- |
| Name | `WSL Delve` |
| Host | `127.0.0.1` |
| Port | `2345` |

点击 **Debug**，按 **Resume** 继续，再通过 Vite 界面触发对应 API。Windows 与 WSL 必须使用生成该二进制的同一版本源码；GoLand 自动匹配远程源码路径，优先在目标文件中提前设置行断点。连接和构建参数见 [JetBrains 远程调试文档](https://www.jetbrains.com/help/go/attach-to-running-go-processes-with-debugger.html)，路径匹配说明见 [JetBrains 调试源码定位说明](https://intellij-support.jetbrains.com/hc/en-us/articles/39062119684242-Go-Remote-debugging-the-editor-does-not-open-the-source-file)。

在启动 Delve 的终端按 Ctrl+C 结束本轮调试器及其子进程。再次调试时重新执行启动命令；源码变更后需先重新构建。

## 常见问题

- **端口或实例锁冲突**：先停止使用同一开发数据库的已有后端，保留独立运行的 Vite。
- **Windows 无法连接调试器**：执行 `Test-NetConnection 127.0.0.1 -Port 2345`，确认 Delve 仍运行且 Windows 到 WSL 的 localhost 转发可用；也可使用第 4 节的原生 WSL 调试。
- **断点无效、变量被优化**：核对调试二进制的构建参数与源码版本，重新构建；不能使用移除了符号的发布二进制。
- **Go 版本不受调试器支持**：升级 GoLand 或重新安装兼容当前 Go 的 Delve，保留版本检查。
- **无法读取配置或权限不正确**：核对工作目录、Linux 绝对路径、非 root 用户和已有密钥权限。
- **初始化或 schema 错误**：按第 3 节手动准备；已有账号升级先备份，调试启动不自动迁移。

## 本次验证范围

2026-10-01 在默认 WSL 的非 root 用户、Linux amd64 / Go 1.27.1 下执行了第 3 节的两条构建命令。两份产物均为可执行的 Linux ELF，保留调试信息；调试版构建记录包含 `-gcflags="all=-N -l"`。`version` 和两份产物的 `check-config --config configs/dev.json` 均成功。

本次未启动新后端、执行数据库迁移或安装 Delve；GoLand 原生调试与远程连接按上述官方文档配置，尚未在 IDE 中实测断点。
