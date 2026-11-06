# helper 进程检查权限：正式模板已授权

## 2026-11-06：系统默认与外部安装管理

用户本轮明确要求定时刷新和管理已安装运行时，并选择“还要修改系统默认，并管理 apt/Homebrew 等安装”。实现增加 helper 协议 v2；以下是新增代码及部署模板的权限范围，**尚未应用到现有服务，也未执行真实系统包卸载**。下文 2026-09-29 的验收只适用于当时的模板与二进制摘要。

- Go Web 服务仍禁止 root，helper 继续校验 Unix peer UID；旧 helper 或缺少沙箱写权限时能力检查失败，界面提示更新/重启。
- 主服务和 helper 的 `ProtectHome` 从隐藏改为 `read-only`，文件系统权限仍限制可读范围。helper 的常驻写入范围额外包含 `/usr/local/bin`，仅对固定运行时命令创建/替换符号链接，不覆盖已有普通文件。系统默认目标必须由 root 保护；普通账号可改写的 Homebrew 安装不能进入全局入口，以免 Web 账号通过替换程序获得 root 执行机会，仍支持面板默认、应用绑定和按来源卸载。
- apt/dpkg 来源通过精确文件归属、语言包名允许列表及已安装状态验证；卸载使用 `dpkg --refuse-all --remove`，保留配置和依赖保护，不自动删除依赖、强制卸载或 purge。Essential/Protected 包拒绝卸载。
- Homebrew 仅接受标准 Linux 前缀和当前面板账号/公共 linuxbrew 安装，核对 formula 与单一已安装 keg。认可安装账号及其组的可写权限，拒绝其他组或全局可写路径；所有 brew 进程先降为安装所属账号，环境不含数据库凭据，禁止强制忽略依赖。Homebrew Node 应用使用 `ProtectHome=tmpfs` 加只读前缀映射，允许读取运行时及其动态库，继续隐藏其他 home 内容。
- 独立目录卸载仅支持有完整 Go 布局的 `/usr/local/go` 和 `/opt/go`。未知来源不会扩大到任意路径删除。
- 外部卸载通过固定参数的临时 systemd 作业执行，避免把常驻 helper 改为全系统可写。作业没有 shell，禁止环境展开，限制能力、网络地址族及内核修改，90 秒运行上限、10 秒停止期限并回收 unit。目标文件、包版本和系统入口指纹在执行前重新核对。
- 卸载前检查进程及系统/临时 unit 的固定路径引用；动态脚本内部间接使用无法静态证明。包管理器失败可能留下其自身的中间状态，任务如实失败，禁止自动重放。

已通过来源/参数边界、临时目录系统入口切换、真实 dpkg 元数据读取、陈旧指纹拒绝和界面刷新/权限提示测试。随机隔离 PostgreSQL 与仅返回事实的临时 helper 验证了预检、目标指纹入队、依赖阻止及拒绝计划不可复用；真实 systemd 临时作业仅执行 `id`/`test`，核实 root 与非 root 身份、Homebrew 组可写夹具的降权执行，以及应用前缀可读、不可写和其他 home 内容不可见，结束自动回收。真实 apt/Homebrew 卸载、升级后的部署模板以及 ARM64 运行验收仍待隔离环境实测，不继承旧验收。

## 2026-09-29：原模板的进程检查权限

调整前的 WSL 实测：原 capability 集合可以安全安装和管理应用，但跨账号读取 `/proc/<pid>/exe` 被内核拒绝；`references.complete=false`，卸载保持禁止。此处不能把未知当作没有引用。

已批准并应用的变化：在 `deploy/zx-panel-helper.service` 的 `CapabilityBoundingSet` 末尾增加 `CAP_SYS_PTRACE`，并增加 `SystemCallFilter=~ptrace process_vm_readv process_vm_writev kcmp`。其他限制、Unix peer UID 校验、固定动作和目录边界保持不变。

该能力允许检查其他进程的敏感信息，扩大了 root helper 的权限。系统调用过滤限制直接跟踪及跨进程内存调用，但不消除所有进程检查权限。自动审批最初因缺少明确持久授权而拒绝修改；2026-09-29 用户明确选择“批准正式模板及隔离复验”，因此现已写入交付单元。此授权不包含对现有业务服务器的安装或启动。

2026-09-29，用户明确选择“批准临时权限和实验版本卸载，结束后撤销”。`scripts/acceptance/wsl-release-checks.py uninstall` 仅对专用 `zx-panel-lab-helper` 在 `/run/systemd/system` 创建临时覆盖，附带系统调用过滤和 15 分钟运行上限；结束时停止进程、移除覆盖并核对能力恢复。新安装的实验 Node.js 版本通过正式 API 卸载，既有版本和应用保留。该授权不包含正式部署单元的持久权限扩张。

临时实验已在 x86_64 WSL 和 WSL 内 QEMU ARM64 来宾通过：Node 26.9.0 新装、默认/配置/独立进程引用拒绝、预检后新增进程拒绝受理、helper 最终删除检查、无引用时删除目录与登记。Node 26.10.0、原默认及已有应用保留。两个环境的临时覆盖均已撤销，实验服务停止。[脱敏报告](acceptance-supplemental.json)。ARM64 慢速模拟中的下载等待上限和即时就绪断言失败也保留在报告中；最终通过的是完整重校验、就绪检查和真实 API 卸载。

正式模板复验使用 `scripts/acceptance/wsl-release-checks.py deployment`：复用既有实验路径/账号映射，整个安装与卸载流程使用交付单元，不添加权限覆盖；记录模板和二进制 SHA256。结束时恢复原实验单元及能力并停止服务。x86_64 和 ARM64 均已通过，原实验配置/能力恢复、专用服务停止、来宾正常关机。最终证据见 [正式模板报告](acceptance-deployment.json)；M5 在本次约定模拟环境范围内完成。

依据：[Linux proc_pid_exe](https://man7.org/linux/man-pages/man5/proc_pid_exe.5.html)、[Linux capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)、[systemd 能力集与系统调用过滤说明](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)。
