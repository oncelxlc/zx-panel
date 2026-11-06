# v1.1 验证与交付记录

## 2026-11-07：GitHub Actions 对齐与本地整链复验

- 核对远端 `feat-manage@778383a` 及前两次运行日志，均因 `TestExternalRuntimePlans` 无条件要求系统 Node 入口可切换而失败。runner 的 `/usr/local/bin/node` 是普通文件，产品返回 `SYSTEM_ENTRY_CONFLICT` 的保护正确；后续契约、浏览器、安全和发布步骤当时均未执行。
- 测试现在分别断言已有普通入口的冲突/受理拒绝、可用入口的确认文本及外部目标指纹变化。WSL 非 root 用户在私有 user/mount namespace 中只读绑定普通 Node 占位文件，清空能力后执行该 race 用例通过；退出后宿主入口状态不变。没有修改产品保护或真实系统 Node。
- CI 增加 actionlint、Node 22.22.2 / 26.0.0 最低版本前端检查；主作业使用 Node 24.15.0、Go 1.27.3、PostgreSQL 18 与同版备份客户端。Go 集成测试增加 `-count=1`，保留编译缓存；各 Actions 更新为使用 Node 24 的版本。PGDG 安装命令在一次性 Ubuntu 24.04 容器中实测成功，客户端均为 18.6，容器及临时镜像已清理。
- Node engines、WSL 检查及边界测试统一为 `^22.22.2 || ^24.15.0 || >=26.0.0`。三个真实最低版本均完成类型、lint、22 项单测、登录/主题/开发脚本与生产资源构建。WSL 开发脚本 9 项通过，1 项普通 Linux 专属检查跳过；新增 Node/Go 版本边界实际执行通过。
- 整链暴露并修复了测试时序和平台假设：权限弹窗等待真正可见；外观与概览多主题/尺寸拆成独立用例，保留原断言、截图和单场景超时；动效取样在状态提交后立即暂停，避免短过渡在取样前结束；Playwright 直接启动 Vite，测试结束自动关闭服务。Mock 共 48 个场景：整跑 47 项通过，剩余动效用例修复后连续 3 次通过。并行阶段曾出现 WSL 连接及 Node 26 登录测试超时，串行完整复核通过，未修改登录用例或增加重试。
- 真实 API 用例按服务器能力验证 Linux 的 helper 提示，选择“暂时浏览”后继续；初始化、HttpOnly/SameSite Cookie、日志导出、密码变更与跨标签撤销均通过。夹具始终禁用真实 helper，只使用随机隔离数据库；性能样本说明改为跨平台的回环夹具范围。
- 安全检查发现现有依赖告警：仅定向覆盖 TypeScript ESLint 的 `minimatch` 为 11.0.1，并验证其实际调用兼容；`x/net` 升至 0.60.0 及必要的 crypto/sys/text/sync 版本，修复 6 个可达 Go 告警。修复版要求最低 Go 1.26，已同步模块、启动器和活跃文档。`pnpm audit` 为 0；Linux `govulncheck` 的受影响调用/导入包均为 0，仍报告 3 条未被本项目调用的模块级告警，没有忽略规则。
- 依赖升级后重新通过 Go 模块完整性、全包 race/vet、PostgreSQL 18 隔离迁移/备份恢复、9 组响应契约及真实 API 浏览器测试。Linux amd64/arm64 主程序与 helper 四个二进制构建成功，SHA256SUMS 全部匹配，运行验收状态仍为 `pending`。actionlint、ESLint 与差异空白检查通过；既有虚拟列表 lint 和构建提示保留。
- 截至本地复验结束，这些修复尚未提交或推送，以上结果不代表修复后的远端 CI 已通过。全部随机测试库和专用 PostgreSQL 容器已清理，既有业务容器保留。没有执行真实包卸载、新模板部署、ARM64 运行或长期负载验收；历史部署摘要不覆盖本轮产物。

## 2026-11-06：运行时持续刷新与外部管理

- 后端保持启动及每分钟扫描；前端每 30 秒补查安装、引用和能力，并在恢复焦点时更新。扫描与卸载提交互斥，避免旧扫描结果恢复已经删除的登记。
- Windows/WSL Go 全包开发模式测试通过；WSL helper/control 包新增安全边界与 race 测试通过，Go vet 通过。只读检查核实了真实 dpkg 元数据和当前 `/usr/local/go` 安装；没有卸载系统 Python 或 Go。
- 随机隔离 PostgreSQL 测试通过：Cookie/任务回归、外部扫描、外部管理预检、指纹入队、目标变化拒绝、依赖阻止及被拒计划不可复用。`pnpm contract --check-go` 校验 9 组真实公开响应通过。
- 前端 16 项单元测试、类型检查和构建通过；lint 零错误，保留日志页既有 TanStack Virtual 警告。构建保留既有外部主题脚本、依赖注释和大 chunk 提示。秘密扫描通过。
- Playwright 配套 Chromium 缺失，改用已安装 Chrome 和临时配置完成 2 项相关浏览器测试：运行时管理动作与权限弹窗，覆盖亮/暗主题、1440/375 宽度、无横向溢出、键盘焦点和关闭/重新打开。截图已检查，临时配置已删除；没有安装新浏览器。
- 真实 systemd 临时作业仅执行 `id`/`test`，核对 root/非 root 身份、Homebrew 组可写夹具降权执行，以及应用前缀可读、不可写和其他 home 内容隐藏。作业自动回收，临时目录与测试二进制已删除。
- **未完成的运行验收：** 真实 apt/Homebrew 卸载、新部署模板和 ARM64 运行。没有替换或重启现有正式服务，也未迁移既有业务数据库；旧 M0–M5 报告与摘要不覆盖新管理边界。具体权限及来源限制见 [helper 权限决定](helper-permission-decision.md)。

## 2026-09-29：原 v1.1 交付验收

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
- 历史验收使用的两张登录背景约 3.77 MB；当前登录页使用单张压缩线稿 `login-bg-lines.webp`。正式构建白名单包含该线稿，原验收哈希不覆盖当前资源和 StyleX 样式变更。
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

## 2026-10-01 开发环境启动验证

- 用户明确授权执行完整开发准备流程。已核对 Compose 数据库为 zx_panel / PostgreSQL 18.6，原 admin 账号保持启用；数据库从 001 升级到 002，两个迁移的 checksum 校验通过。上述事故记录中“002 未应用”是当时状态，当前开发库已完成迁移。
- 迁移前使用容器同版 pg_dump 18 生成新备份，并在随机 zx_panel_dev_restore_e79906b9bb40 库核对 current_database 后恢复；账号、密码摘要、角色和启用状态与源库一致，临时恢复库已删除。CLI 迁移另生成一份新备份。备份和独立密钥均保存于 WSL 当前用户私有目录，权限 0600。
- 联合命令加载交互式登录 Bash，识别 Homebrew Go 1.27.1 / Node 24.21.0。可选、被忽略的 configs/dev.json 将数据和密钥放在 ~/.local/share/zx-panel-dev 的 Linux 文件系统；数据目录 0700、密钥 0600，避开无 metadata 的 Windows 挂载盘。命令不自动迁移、初始化账号或启动数据库。
- WSL 系统 pg_dump 16 不兼容当前 PG18；本机在 ~/.local/share/zx-panel-dev/tools/pg_dump 创建容器客户端适配器，仅供当前 Compose 开发库 CLI 备份使用。后续在 WSL 运行备份/已有账号迁移前使用 export PATH="$HOME/.local/share/zx-panel-dev/tools:$PATH"，CLI 显式传 --config configs/dev.json。其他数据库使用与其版本匹配的客户端。
- 真实 Chromium 使用现有本地管理员凭据通过登录/注销、HttpOnly + SameSite=Strict Cookie、六页面、10 个读取 API 与 metrics.sample SSE；资源图表完成 SVG 渲染，没有观察到浏览器运行时错误或失败响应。截图和详细结果在被忽略的 test-results/dev-* 文件。
- 后端实际退出联动停止 Vite，重新启动未发生实例锁冲突；Windows 原生 Ctrl+C 后联合命令返回 130，7200/25000 端口关闭且开发 Go/Bash 无残留。自动化 PTY 写入 ETX 未送达信号的尝试不计为通过。
- 验证范围为 Windows Vite + Ubuntu 24.04 WSL2 Go 的 development 配置；privileged helper 按开发示例保持关闭。

最终回归：pnpm test:dev、相关 ESLint、pnpm typecheck、Bash 语法和 git diff --check 通过；248 个可交付文本未命中既有秘密特征。服务重新启动后健康与同源 API 均为 200，并保留运行供开发。

## 2026-10-01 运行时自动发现开发库迁移与启动验证

- 按用户授权核对显式 `configs/dev.json` 指向本机 Compose 的 `zx_panel` / PostgreSQL 18.6，确认 7200/25000 无运行中的开发服务后，将开发库从 002 升级到 003；三个历史迁移的 checksum 校验通过，已应用 SQL 未改写。
- CLI 复用当前用户私有目录中的 PostgreSQL 18 容器客户端适配器，先生成新备份 `~/.local/share/zx-panel-dev/backups/before-external-runtimes-20261001225243.dump`（717,517 字节、0600），再执行迁移。`pg_restore --list` 可读取归档目录并记录 SHA-256；本轮未执行完整备份恢复。迁移前后的只读摘要确认全部账号字段（含密码摘要、角色和启用状态）、独立密钥、应用与任务保持一致。
- `pnpm dev:all` 实际启动 Windows Vite + 默认 WSL 非 root Go，后端 `/healthz`、前端登录页与同源代理均返回 200。真实 Chromium 使用原管理员凭据通过六页面、10 个读取 API、Cookie/CSRF、`metrics.sample` SSE 和注销；没有浏览器运行时错误或失败响应。
- 运行时页与真实安装 API 发现 Node.js 24.21.0、Go 1.27.1、Python 3.14.7 / 3.12.3，Homebrew 与系统路径均通过前端 Schema 校验；Node.js/Go 详情显示真实路径并保持外部安装只读。开发 helper 保持关闭，联合服务保留运行。记录和截图见被忽略的 `test-results/dev-runtime-migration-report.json`、`test-results/dev-runtime-browser-report.json`、`test-results/dev-runtimes-003.png`。

## 2026-10-30 前后端目录迁移验证

- 前端源码、资源、Vite/TypeScript/shadcn 配置与页面测试迁入 `frontend/`；现有 Go/Gin module `zx-panel`、配置、Compose 和本地开发数据路径迁入 `backend/`。根目录 pnpm workspace 保留统一脚本、锁文件和共享工具。
- 231 个已跟踪迁移文件均已核对目标存在；业务源码和静态资源保持原内容。仅调整后端示例环境、Compose 注释及两个 API 测试的仓库相对路径。全部 SQL 迁移逐字节一致；锁文件仅拆分项目 importer，依赖版本与 package snapshots 未改变。
- 固定锁文件安装、TypeScript、ESLint、11 项 Vitest、3 项登录和 2 项主题测试通过；ESLint 保留原有虚拟列表兼容性警告。Chromium Mock E2E 10 项通过，覆盖路由、双主题、断点、日志、操作反馈和移动端导航。
- Windows 开发脚本测试 8 项通过、2 项平台跳过；WSL 9 项通过、1 项普通 Linux 专属检查跳过。新增前后端工作目录断言通过；Bash 语法和真实 WSL 后端 `--check` 通过。
- Windows 与 WSL 均通过 `go -C backend test -tags devassets ./...` 和 `go -C backend vet -tags devassets ./...`；WSL 正式嵌入资源与 API 包测试也通过。首次 Windows 沙箱的 Go 文件重命名和 Vitest 临时缓存读取失败，正常用户环境复核全部通过，未修改测试规则。
- `pnpm contract` 成功且 OpenAPI/错误码无漂移；shadcn 正确识别 `frontend/` 下的 Vite、Base UI/Nova 和组件路径。API 资源构建、Linux amd64/arm64 主程序与 helper 发布构建成功，秘密特征扫描及差异空白检查通过。
- 本轮未连接数据库执行集成测试、未迁移数据库、未部署或重跑 systemd/QEMU/race/稳定性验收，未触发远端 CI。新发布产物的 `linuxAcceptance` 为 `pending`，历史验收仅适用于原报告摘要。GoLand 新目录下的断点调试尚未实测。

## 2026-11-07 加载与运行开销优化

- 保留功能、界面、API、采样/轮询频率和容量限制，仅调整路由依赖加载、日志字节计数与原始历史样本的单指标读取；没有新增依赖或修改数据库、helper、部署模板和开发启动流程。
- 同机分别执行改动前后的 `pnpm build`，用已安装 Chrome 的独立新上下文访问生产静态产物 `/login` 和 `/setup`，仅拦截初始化状态 API；收集页面实际请求的全部 JS（含 `theme-init.js`）。两页均无浏览器运行时错误。gzip 列为逐文件本地压缩估算，不是 Nginx 网络实测；不包含 CSS、图片或 API。

| 页面 | JS 原始字节：优化前 → 后 | gzip 估算字节：优化前 → 后 |
| --- | --- | --- |
| 登录 | 821,387 → 595,233（减少 27.5%） | 268,960 → 196,372（减少 27.0%） |
| 初始化 | 858,590 → 710,701（减少 17.2%） | 281,833 → 237,322（减少 15.8%） |

- `AuthGuard` 与 `MainLayout` 沿用现有路由 `lazy` 方式，认证树不变；首次进入后台会加载独立分包。主入口由 812,438 降至 561,280 字节，仍超过 Vite 500 kB 提示阈值；没有调高阈值。既有外部主题脚本与 Zod 注释构建提示保留。
- 日志合并以固定 16 KiB 缓冲复用 `TextEncoder.encodeInto`，超长字段回退完整编码。Node 26.13.0 合成微基准对比改动前后真实 `mergeLogs`：5000 条保留日志加 1 条新日志、每轮 100 次、预热后 3 轮中位数 689.15 → 149.80 ms，输出深比较相等。该结果不是浏览器整页耗时或长期负载数据。
- 历史查询内存基准：Windows amd64、Go 1.27.3、Intel i7-14700HX，450 个样本、64 核、4 组设备，`go -C backend test -tags devassets ./internal/control -run '^$' -bench '^BenchmarkCollectorHistory$' -benchmem -count=3`。三轮中位数：CPU 8.739 → 0.251 ms/op，单核 9.347 → 0.378 ms/op，网络发送 8.008 → 0.280 ms/op；每次分配约 6,651,600 → 382,034 字节（减少 94.3%），46,400 → 2,288 次分配。此基准不连接数据库或主机采集器，不代表 Linux 生产服务延迟。
- 验证通过：`pnpm build`、`pnpm typecheck`、22 项 Vitest、`pnpm lint`（保留原有 `useVirtualizer` 兼容性警告），control 包全部单测与 `go vet -tags devassets ./internal/control`、`git diff --check`。新增编码边界、精确容量、指标映射等价和历史窗口测试。
- 本机 Chrome Mock E2E 7 项通过：新增公共页面延迟加载/后台直达，全部 4 项登录测试、主路由/任务深链、高吞吐日志虚拟窗口。临时配置仅将浏览器切为已安装 Chrome，并使用独立 7204 端口；未修改仓库 Playwright 配置。沙箱清理未能关闭测试服务器，定向结束本轮 Vite 后，测试命令正常返回 0，服务器已清理。
- Windows 沙箱内 control 完整测试曾因 `TestArtifactCacheIntegrity` 的临时文件 `renameat` 报 `Access is denied` / `The handle is invalid`；相同代码、相同完整测试命令在普通本机环境复跑通过，未跳过测试或调整校验。
- 本轮没有重建正式嵌入资源/发布二进制、连接数据库或执行 Linux/systemd/QEMU/race/长期负载验收；历史部署验收哈希不覆盖这些源码变更。
