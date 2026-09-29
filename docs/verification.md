# v1.1 验证与交付记录

验证日期：2026-09-29。环境：Windows、Node 24.21.0、pnpm 12.6.0、Go 1.27.1、Chromium，以及用户授权的 Ubuntu 24.04 WSL2 x86_64 / systemd / 独立 PostgreSQL 16.15 / Nginx 1.24；ARM64 使用 WSL 内独立 QEMU TCG 完整系统来宾。本文区分实现、Mock、已观察结果和未验收项。

## 阶段与真实接入

| 阶段 | 实现 | 验证边界 |
| --- | --- | --- |
| M0 | 33 条 OpenAPI 路径、共享 Zod / Go DTO、错误码、严格输入、配置/CLI、主题和迁移 | 类型、路由/响应契约、CLI、登录/主题回归通过 |
| M1 | 六页及详情、初始化、搜索、Sidebar/移动 Sheet、任务/预检、图表、有界日志、集中 MSW | 双主题、五断点、键盘、任务链路、异常/爆量场景通过；截图为明确标记的 Mock |
| M2 | Cookie/CSRF、PG 会话、单采集器、历史、进程、主/日志 SSE、断流回退 | WSL 真实 Linux 指标、TLS Cookie、Nginx SSE/日志批次、注销断流、重启/旧 epoch reset 已通过 |
| M3 | 持久计划/任务/幂等/outbox、官方目录、摘要缓存、安全解包、默认/卸载、证据恢复 | 24 路幂等/事务、双架构模拟安装/恢复通过；双架构临时授权下完整引用检查和卸载通过并撤销权限；正式部署模板也已在双架构通过相同链路 |
| M4 | 托管 Node/二进制、systemd helper、cgroup、加密环境、日志/导出 | WSL systemd 生命周期、保存不重启、字面参数、cgroup、Unix peer、秘密脱敏/导出及删除保留文件/journal 已通过 |
| M5 | API-only embed、双架构构建、systemd/Nginx、备份命令、CI 与验收流程 | **完成本次本地与 WSL/QEMU 验收**。正式模板双架构复验、摘要绑定和停机清理通过；范围与限制见 linux-acceptance.md |

真实 API 模式完全排除 MSW，不会用示例指标填充不支持的平台。Windows 的 Linux 指标返回 null / unavailable，管理能力禁用。Mock 使用固定时间和数据，并支持明确异常场景。

## 已执行检查

- `pnpm typecheck`：通过。
- `pnpm lint`：0 错误；1 条 TanStack Virtual 与 React Compiler 自动记忆化不兼容的提示。项目未启用 React Compiler，未禁用此规则。
- `pnpm test`：2 个文件、5 条测试通过；覆盖 Schema/Mock、严格操作输入、零值/时效、有界日志、实际导航。
- 原有 Node 测试：登录 3 条、主题 2 条通过；保留原有模块类型提示。
- Playwright：7 项通过（51.1 秒）。六页、安装预检到任务深链、两主题 × 1440/1280/1024/768/390、桌面/390px 六页截图、键盘搜索、引用面板、磁盘 I/O、未保存草稿、空/过期/预热/受限/断流/会话/初始化、5,000 条日志裁剪及虚拟窗口、移动 Sheet、跨标签主题。已保存 [34 张截图](screenshots/README.md)。
- 真实 API 浏览器测试：正式内嵌前端，无 MSW/Vite；一次性初始化、真实 Cookie 登录、概览读取、持久导出与下载、改密后两个标签页撤销。发现并修复 QueryClient 清除后认证守卫未即时更新的问题。
- `go test -tags devassets ./...` 和正式资源构建后的 `go test ./...`：通过；隔离 PG 测试另外启用 `ZX_PANEL_INTEGRATION=1`，验证旧账号摘要保留、会话撤销、初始化重放、CSRF/Host、严格输入（含无效 Unicode / 过深嵌套）、24 路幂等、事务回滚、queued 取消、running 恢复、outbox、worker/export、注销断开真实 SSE、日志锚点清理后拒绝旧游标，以及消失的外部安装降为 unknown。
- `pnpm contract --check-go`：8 份真实 Go API 响应通过前端 Zod；真实 Gin 方法/路径集合与 33 条 OpenAPI 路径一致。
- `go vet -tags devassets ./...`、Linux amd64/arm64 交叉编译通过。Linux helper 测试已交叉编译，但没有在 Windows 运行 Linux 测试。
- WSL 实际 `go test -race -count=1 -tags devassets ./...`、`go vet -tags devassets ./...` 通过。启用隔离 PG 集成测试，新增双隔离库 `pg_dump` / `pg_restore`：验证账号、业务应用、密文、独立密钥复制后的解密和错误密钥拒绝。生产备份 CLI 实际生成 0600 自定义格式归档。
- ARM64 QEMU 来宾实际运行正式主程序/helper、PostgreSQL 和 Nginx：官方 Node 26.10.0 / Go 1.27.1 安装、Cookie/CSRF、指标、Node/二进制生命周期、cgroup、字面参数、18,000 字节秘密脱敏/导出、helper 拒绝边界、SSE/重启/reset、下载取消及 SIGKILL 中断恢复、生产备份 CLI、日志翻页/筛选/失效游标通过。[ARM64 报告](acceptance-arm64.json)；[x86_64 报告](acceptance-wsl.json)。ARM64 未重复执行 30 分钟负载或 race/恢复库集成；对应证据来自 x86_64。
- 经用户明确批准，x86_64 和 ARM64 均在临时 `CAP_SYS_PTRACE` + 系统调用拒绝过滤下验证：默认/停止应用配置/独立跨账号进程引用拒绝，预检后新增进程使受理失败，helper 最终检查拒绝删除；解除引用后成功卸载本轮新装 Node 26.9.0。Node 26.10.0、旧默认和原应用保留。两个环境的临时覆盖已删除，原能力集恢复，服务停止；正式单元未修改。[补充报告](acceptance-supplemental.json)。
- ARM64 卸载补测保留两次前期失败：下载达到验收脚本 900 秒等待上限；缓存安装成功后，即时 CapEff/Seccomp 断言失败。续测使用宿主从官方 HTTPS 下载并核对 SHA256 的同一包，生产安装器和 helper 重新校验，没有放宽产品时间预算。实际观察到 Type=simple 返回后仍为 systemd-executor / Seccomp=0，稍后才成为 helper / Seccomp=2；验收现等待 exe、能力、seccomp、Socket 和 probe 全就绪，并只复用失败报告记录的新装版本，完整卸载链路通过。
- 用户随后明确批准正式模板及隔离复验：交付 helper 增加 CAP_SYS_PTRACE 和四项系统调用拒绝过滤，整个安装/引用/卸载链路在 x86_64、ARM64 均通过，无临时权限覆盖。模板与实际二进制 SHA256 一致；原实验单元/能力恢复，服务、专用端口和虚拟机停止，既有 Docker 仍运行。[正式模板报告](acceptance-deployment.json)。当前发布元数据已绑定该报告，未来重新构建会重置验收状态。
- 原能力集下，真实 systemd 应用向 journal 输出至少 60,000,000 字节：超过 50 MiB 的导出返回 `EXPORT_TOO_LARGE`、临时文件被清理、下载返回 404；精确筛选的 55 字节导出成功。补测脚本采用服务端任务起点、后端冻结终点，避免依赖客户端时钟；前期两次范围请求 422 未计为通过，产品校验规则未放宽。
- `pnpm release`：主程序、helper 四个二进制成功构建，附 SHA256SUMS、build-info.json。API 资源扫描排除 Mock worker、示例数据模块、秘密文件。未提交、推送或部署到现有业务服务。
- 文本秘密特征扫描：未发现已配置模式；不读取被忽略的真实 .env/密钥目录。不是穷尽式秘密检测。
- `pnpm audit`：0 个已知漏洞。
- `govulncheck`：Windows 与 Linux amd64 构建路径的调用符号和已导入包均为 0 个受影响项；x/crypto 模块中有 4 条未被本项目导入/调用的 SSH、OpenPGP 告警。SSH 修复版 v0.56.0 要求 Go 1.26，未为未使用功能扩大本轮工具链下限。OpenPGP 告警无修复版本；面板不使用 OpenPGP 或 SSH。

## 性能样本

- 真实 API 浏览器环境，`GET /api/v1/metrics/latest` 顺序 30 次：p50 1.5 ms、p95 1.8 ms（Windows 回环、单浏览器、已建立会话）。[原始记录](performance-windows.json)。不代表 Linux 主机或并发长期负载。
- Vite 构建估算：主入口约 795 kB / gzip 259 kB；历史数据返回后加载的图表约 340 kB / gzip 103 kB；日志约 34 kB / gzip 12 kB。完整概览成本还包含图表和路由资源，实际网络口径见下一条。构建仍提示单块超过 500 kB，未调高阈值掩盖提示。
- 补充真实 Nginx TLS 冷缓存测量：原配置未压缩，初始 JS 为 816,563 字节。部署模板现仅对静态 JS/CSS 启用 gzip，实测初始 JS **276,022 字节（约 270 KiB）**，达到 300 KiB 目标；延后图表约 104 KiB，完整概览约 373 KiB，分别保留而不混淆。真实 API JSON 和 SSE 均保持 identity 编码，浏览器异常为零。[压缩前后逐资源报告](performance-assets-wsl.json)。此条补齐上一条的目标机网络口径；构建警告仍如实保留。
- 两张既有登录背景约 3.77 MB，仍为实际页面使用的资产。正式构建只复制明确引用的静态白名单。
- WSL 真实 API / TLS Nginx / Chromium 连续 1800 秒，1/5/10 个独立浏览器上下文各 10 分钟，共用同一管理员会话。日志生产者约 100 行/秒；缓冲始终不超过 5000 条，DOM 最多 47 行，最后一分钟累计裁剪 173,614 条。30 组共 300 次只读请求总体 p95 **4.7 ms**；无浏览器异常或 5xx，86 次 429 来自预设每账号最多 8 条主流，额外上下文使用轮询。[原始记录与分组统计](performance-wsl.json)。
- 1/5/10 浏览器阶段主服务 p95 分别为 6.5 / 4.4 / 4.6 ms；主服务 RSS 范围分别 26.0–35.9 / 37.0–40.7 / 41.1–42.0 MiB，阶段末 goroutine 14 / 22 / 28、FD 16 / 22 / 25。主服务 cgroup 平均 CPU 分别约单核 0.30% / 0.40% / 0.56%，helper 含子进程约 1.04% / 1.08% / 1.14%。PG 全库由 12,450,839 增至 13,958,167 字节，包含正常监控聚合写入。
- 此样本启用减少动效；构建和 ARM 虚拟机未在 30 分钟采样期间运行。RSS 为主进程口径，cgroup CPU 包含子进程；cgroup 采样从第 3 分钟开始。浏览器 `performance.memory` 为近似读数，不等同精确堆快照或绝对无泄漏证明。WSL 结果不代表裸机或 ARM64 性能。

## 未验证及明确限制

1. Linux 执行结果来自用户授权的 WSL2 x86_64 和 QEMU ARM64 完整系统模拟。ARM64 已执行正式二进制与业务操作，但模拟结果不代表原生 ARM 的网络/磁盘性能、整机断电或不同发行版兼容性。
2. 正式 helper 需要已明确批准的 CAP_SYS_PTRACE 以检查跨账号引用。syscall 过滤限制直接跟踪/内存调用，但不消除全部进程检查权限；未知或不完整引用仍禁止卸载。正式模板已在双架构复验通过；受限容器、额外内核安全策略或未安装正确单元的目标机仍可能能力降级，见 [权限方案](helper-permission-decision.md)。
3. Windows 自身仍不支持本轮 Linux race；已由真实 WSL/GCC 执行通过。远端 CI 没有触发，不能称为远端 CI 已通过。
4. helper 将复制、解包、受限身份验证及原子重命名封装在单次提交调用中。进入该受保护阶段后 UI 禁止用户取消；下载阶段可以取消。动作预算 110 秒、连接上限 2 分钟；解包也检查截止时间，清理可能继续占用资源。ARM64 修复后使用缓存包的 Go 安装任务约 94 秒，包含预检与提交，不代表原生安装性能。
5. Node/Go 维护周期目前显示 unknown 并在安装预检提示，不推断未验证的支持状态。安装兼容性预检查原生 Linux、架构和 glibc/内核，动态依赖仍由真正执行版本检查确认。
6. 配置保存成功但 unit 更新失败会显示部分结果，用户可重新保存修复；不宣称已重启。恢复只认有证据的已提交安装，其他任务标为 interrupted。

## WSL 实测修复

- `0077` umask 使安装目录和归档文件不可被服务账号读取。解包后显式规范化目录 0755、文件 0644/0755，去掉特殊权限位；增加 Linux umask 回归。
- helper 使用系统管理器的默认 root 身份，保留明确 capability 边界与 `NoNewPrivileges`；实际版本验证子进程为非 root、清空附加组。没有把 Web 进程改为 root。
- systemd `WorkingDirectory` 使用标量语法，列表路径与 `ExecStart` 使用各自引用规则。包含空格和 `%n` 的目录、包含 `$HOME` / `%n` / 前后空格的参数均已实测；无法安全表示的目录在预检拒绝。
- 官方 HTTP 下载保留 `context.Canceled`，真实取消显示 canceled；SIGKILL 后任务恢复为 interrupted 并清理暂存。
- Nginx 使用 `$http_host` 保留显式 TLS 端口，精确 Host 校验正常。
- `journalctl` 的时间起点与游标选项互斥。第一轮负载发现循环 reset，因此作废该轮；修复为逐条核对游标锚点并检查时间下界，真实日志 SSE 已持续交付。日志负载脚本同时断言实际增长、5000 条缓冲和非空虚拟窗口，避免仅检查空 DOM 的无效通过。
- 长负载后的交互补测发现日志裁剪会移动暂停位置、程序滚动会错误关闭跟随。现按记录 ID 计算裁剪量并补偿滚动，仅用户输入停止跟随；没有额外复制暂停缓冲。Mock 高吞吐回归及真实 API 暂停/恢复、专用 Nginx 停启断流续接、空/非空文本筛选均通过。30 分钟样本在此交互修复前采集；该样本证明缓冲/资源边界，不作为暂停行为的通过证据。
- 真实 systemd 应用输出 18,000 字节环境秘密，API/日志/导出均完整替换为 `[REDACTED]`，未先截断泄漏秘密前缀。
- `logLevel` 现在实际控制 slog；仅 debug 级别每分钟记录 goroutine 数，用于可复现的资源采样，默认 info 不产生该采样日志。
- ARM64 准备阶段实际发现：切换服务账号后，生产 CLI 因尝试读取原账号当前目录的 `.env` 而失败。生产现在只读取显式配置和进程环境；开发 dotenv 兼容及错误校验仍保留。新增回归与最新 Linux race/PG/vet 通过。
- 严格 JSON 现在拒绝非空类型字段和数组元素中的 `null`，避免 Go 默认将其静默转换成空字符串/零值；显式空字符串、false 和可空指针仍合法。密码和启动参数保留原值。
- ARM64 模拟发现 Go 解包超过 helper 截止时间后仍继续展开，直到版本核验才失败。现压缩流读取、文件边界和原子重命名前检查 context；归档复制也在取消时关闭源文件。复用已创建目录缓存，减少每个文件重复的目录检查。取消回归及 Linux security/host race 通过，原有时间、体积和文件数预算不变。

## 开发库迁移事故记录

第一次隔离集成测试错误地修改 pgx 配置后继续使用 `ConnString()`；该方法返回原始连接串，因此 **001 迁移误执行到了现有开发数据库**。随后立即停止并只读核查：原有 1 个账号和密码摘要保留；新增业务表和 1 个预登录记录；旧 Bearer 会话按迁移被撤销；任务、应用、安装均为 0。没有回退、删除新表或继续向业务库写测试数据。

修复后使用重建 URL 的独立数据库，并在任何测试 DDL 前强制 `SELECT current_database()` 等于新生成的 `zx_panel_test_*` 名称且不等于源库；之后测试全部仅在隔离库执行并清理。001 文件已冻结；002 是追加索引迁移，**没有应用到现有开发库**。现有开发库下次启动新服务前，需要按 README 停服、安装 pg_dump、备份并显式执行剩余迁移。旧登录会话需要重新登录。
