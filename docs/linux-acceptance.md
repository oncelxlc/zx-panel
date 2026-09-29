# Linux 发布验收记录

状态：**M0–M5 已完成约定的本地、WSL2 x86_64 与 QEMU ARM64 验收。** 用户明确允许在 WSL 模拟实验；目标基线仍为 Ubuntu 24.04 / systemd。用户随后明确批准正式 helper 模板，双架构已使用最终模板通过安装、引用保护与卸载；原实验配置/能力已恢复，服务和虚拟机已停止。[模板与二进制摘要报告](acceptance-deployment.json)。下表以 x86_64 为主，ARM64 覆盖单独记录。

2026-09-29 实验使用 Ubuntu 24.04 WSL2、内核 6.18.33.2-microsoft-standard-WSL2、8 个逻辑核 / 3.8 GiB、PostgreSQL 16.15、Nginx 1.24、Go 1.27.1。所有测试使用专用目录、账号和数据库，不操作 WSL 现有 Docker、PostgreSQL 18 或原开发库。

| 检查 | 操作与通过条件 | 实测 |
| --- | --- | --- |
| 无开发 CLI 启动 | 服务 PATH 不提供 Node/Go CLI，内嵌 UI 正常、无 Mock 标识 | 通过；验收工具链另放实验 tools 目录 |
| 权限边界 | Web 非 root；错误 UID 访问 helper 被拒；目录受控 | 通过 peer 正/反例、非 root 子进程及目录权限检查 |
| 安装校验 | Node.js 与 Go 官方包摘要、版本输出、非 root 验证、原子目录 | Node 26.10.0、Go 1.27.1 安装成功 |
| 校验失败 | 坏摘要不能提交可用安装 | 实际 helper 坏摘要拒绝；任务/缓存错误语义由测试覆盖 |
| 解包边界 | 路径穿越、链接、设备、体积/项数上限 | 实际 helper 路径穿越拒绝；其余归档边界在 Linux Go 测试通过 |
| 默认与引用 | 默认、配置、进程或检查不完整阻止卸载 | 临时授权及最终正式模板下均通过完整扫描、各类引用拒绝、预检后新增进程拒绝和成功卸载；旧默认/版本/应用保留。实验配置恢复，见 acceptance-deployment.json |
| 应用生命周期 | 登记停止；真实启停/重启；保存不重启；删除保留文件/日志 | Node 和本机二进制通过；含空格/% 的目录和字面参数通过 |
| 秘密 | API、任务、日志/导出不回显秘密 | 真实短秘密与 18,000 字节环境秘密的完整脱敏/导出通过；密文/错误密钥测试通过 |
| cgroup | 多进程应用 CPU/RSS 按 cgroup 汇总 | 父/子 Node 程序真实采集通过；未专门制造多核 >100% 负载 |
| 日志 | 筛选、暂停、轮转、游标失效与有界导出 | 真实历史翻页/筛选/导出/增量流、暂停恢复、代理断流重连和失效锚点通过；新增真实 6000 × 10000 字节日志：超 50 MiB 拒绝并清理临时文件，55 字节筛选导出成功 |
| SSE 代理 | 及时交付、断流/reset、退出断流 | Nginx TLS 每 2 秒指标、重启 epoch/reset、注销后 3 秒内断流通过；慢连接为代码边界测试 |
| 排空恢复 | 下载取消/清理、提交禁取消、running 恢复 | 实际下载 canceled、SIGKILL 后 interrupted 且暂存清理通过；没有整机断电实验 |
| 备份恢复 | 新文件 pg_dump、新库 pg_restore、独立密钥解密 | Linux race 集成中双隔离库恢复通过；生产 backup CLI 的 0600 自定义归档通过 |
| 稳定性 | 1/5/10 浏览器、日志高吞吐连续 30 min；RSS/CPU/goroutine/FD/PG/裁剪数 | 通过 1800 秒采样，p95 4.7 ms、10 浏览器 RSS 41–42 MiB、5000 条 / 最多 47 行；详见 performance-wsl.json。首次故障采样作废 |
| 首屏资源 | 按浏览器请求记录初始 JS（目标小于 300 KiB gzip），按第 14 节单列延后图表/日志，并另报完整概览总成本 | Nginx 静态压缩后真实初始 JS 276022 字节（约 270 KiB）通过；延后图表约 104 KiB、完整概览约 373 KiB，见 performance-assets-wsl.json |

## 复现实验

脚本只面向本次 `E:/Github/zx-panel` 与 `Ubuntu-24.04` WSL 实例，不是通用生产安装器。准备阶段会安装 Ubuntu GCC、PG16、Nginx 软件包；仅本次新装包生成的默认服务被置为不自动启动。首次准备遇到同名目录、账号或已占用实验端口会拒绝。

```powershell
pnpm release
wsl.exe -d Ubuntu-24.04 -u root -- bash /mnt/e/Github/zx-panel/scripts/wsl-lab.sh prepare
wsl.exe -d Ubuntu-24.04 -u root -- bash /mnt/e/Github/zx-panel/scripts/wsl-lab.sh checks
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py acceptance
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py boundaries
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py recovery
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py load
node scripts/wsl-stability.mjs 30
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py logs
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-lab.py stop
```

- 资源：`/opt/zx-panel-lab`、`/etc/zx-panel-lab`、`/var/lib/zx-panel-lab`；账号 `zx-lab-web` / `zx-lab-app` / `zx-lab-db`。
- 专用 systemd 单元前缀 `zx-panel-lab`；PG `25433`、API `25001`、Nginx TLS `27443`，只监听回环。
- 凭据和 TLS 私钥仅保留于 `/etc/zx-panel-lab` 的受控文件，不写进仓库或控制台。浏览器测试只对实验自签证书使用独立 context 例外；产品 HTTPS/Cookie 规则保持启用。
- 原始报告和私有数据库备份位于 `/opt/zx-panel-lab/reports`；浏览器脱敏采样与截图位于被忽略的 `test-results/wsl-stability`。公开结果需单独归档到 docs，不复制数据库或密钥。

`scripts/wsl-release-checks.py deployment` 复验已授权的正式 helper 模板，结束恢复原实验单元和能力并停止服务；报告绑定交付模板/二进制 SHA256。`scripts/wsl-release-checks.py export` 在原能力集下验证实际导出上限；`scripts/wsl-release-checks.py uninstall` 需要事先明确批准临时 `CAP_SYS_PTRACE` 和实验版本卸载，不应当作普通检查自动调用。脚本支持专用 x86_64/aarch64 实验，要求实验服务初始停止，完成后恢复能力并停止服务。安装成功后才授予临时权限，等待实际二进制、能力、seccomp 和 Socket 就绪；`uninstall --resume-installation` 只复用本脚本失败报告中的新装版本，不接受任意安装 ID。`scripts/wsl-resource-budget.mjs` 对运行中的专用代理测量冷缓存资源，不输出 Cookie。

ARM64 补充实验脚本 `scripts/wsl-arm64-lab.py` 在 WSL 内启动独立 QEMU 8.2.2 TCG 系统模拟，使用 [Ubuntu 官方固定版本镜像](https://cloud-images.ubuntu.com/releases/noble/release-20260911/)并核对 SHA256；使用 [QEMU virt 平台](https://www.qemu.org/docs/master/system/arm/virt.html)与 [cloud-init NoCloud](https://docs.cloud-init.io/en/latest/reference/datasources/nocloud.html)。来宾为 aarch64 / Ubuntu 24.04 / Linux 6.8.0-139-generic、2 vCPU / 2048 MiB。QEMU 宿主进程为独立非 root 账号，只读共享发布二进制、部署配置和验收脚本；SSH 私钥、磁盘、数据库都独立。

ARM64 已通过无系统 Node/Go CLI 启动、官方 Node/Go 安装、真实指标与认证、Node/二进制生命周期、保存不重启、cgroup、参数原值、18,000 字节秘密脱敏/导出、helper 拒绝边界、SSE/注销/重启 reset、下载取消、SIGKILL 中断恢复、生产备份 CLI、日志翻页/筛选/失效游标。[原始脱敏报告](acceptance-arm64.json)。另在临时授权下通过完整引用、预检后竞争拒绝、helper 最终检查和新版本成功卸载，权限已撤销；安装包由宿主从官方来源下载、核对 SHA256 后放入来宾缓存，再由产品重新校验，前期超时及就绪断言失败单独保留。[补充报告](acceptance-supplemental.json)。随后正式模板也已在双架构复验通过，见 [正式模板报告](acceptance-deployment.json)；额外主机限制导致引用检查不完整时仍禁止卸载。ARM64 没有重复 30 分钟负载或 race/恢复库集成，不据此推断原生 ARM 性能。

```powershell
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-arm64-lab.py prepare
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-arm64-lab.py verify
wsl.exe -d Ubuntu-24.04 -u root -- python3 /mnt/e/Github/zx-panel/scripts/wsl-arm64-lab.py stop
```

ARM64 使用宿主 `/opt/zx-panel-arm64-lab`、私钥目录 `/etc/zx-panel-arm64-lab` 和独立来宾磁盘；只转发宿主回环 SSH `27222`。来宾中的同名实验目录与 PostgreSQL 属于其私有磁盘，与 x86_64 实验隔离。报告保留历史失败任务，不把重试前失败改写为成功。

禁止在现有业务库中注入坏安装包、删除运行时或进行恢复覆盖。恢复目标必须是明确的新数据库，并在任何写入前查询 `current_database()` 核对目标。实验目录保留用于复验；不得把运行时卸载的不完整检查改成成功来通过验收。
