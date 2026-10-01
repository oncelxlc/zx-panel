# helper 进程检查权限：正式模板已授权

调整前的 WSL 实测：原 capability 集合可以安全安装和管理应用，但跨账号读取 `/proc/<pid>/exe` 被内核拒绝；`references.complete=false`，卸载保持禁止。此处不能把未知当作没有引用。

已批准并应用的变化：在 `deploy/zx-panel-helper.service` 的 `CapabilityBoundingSet` 末尾增加 `CAP_SYS_PTRACE`，并增加 `SystemCallFilter=~ptrace process_vm_readv process_vm_writev kcmp`。其他限制、Unix peer UID 校验、固定动作和目录边界保持不变。

该能力允许检查其他进程的敏感信息，扩大了 root helper 的权限。系统调用过滤限制直接跟踪及跨进程内存调用，但不消除所有进程检查权限。自动审批最初因缺少明确持久授权而拒绝修改；2026-09-29 用户明确选择“批准正式模板及隔离复验”，因此现已写入交付单元。此授权不包含对现有业务服务器的安装或启动。

2026-09-29，用户明确选择“批准临时权限和实验版本卸载，结束后撤销”。`scripts/acceptance/wsl-release-checks.py uninstall` 仅对专用 `zx-panel-lab-helper` 在 `/run/systemd/system` 创建临时覆盖，附带系统调用过滤和 15 分钟运行上限；结束时停止进程、移除覆盖并核对能力恢复。新安装的实验 Node.js 版本通过正式 API 卸载，既有版本和应用保留。该授权不包含正式部署单元的持久权限扩张。

临时实验已在 x86_64 WSL 和 WSL 内 QEMU ARM64 来宾通过：Node 26.9.0 新装、默认/配置/独立进程引用拒绝、预检后新增进程拒绝受理、helper 最终删除检查、无引用时删除目录与登记。Node 26.10.0、原默认及已有应用保留。两个环境的临时覆盖均已撤销，实验服务停止。[脱敏报告](acceptance-supplemental.json)。ARM64 慢速模拟中的下载等待上限和即时就绪断言失败也保留在报告中；最终通过的是完整重校验、就绪检查和真实 API 卸载。

正式模板复验使用 `scripts/acceptance/wsl-release-checks.py deployment`：复用既有实验路径/账号映射，整个安装与卸载流程使用交付单元，不添加权限覆盖；记录模板和二进制 SHA256。结束时恢复原实验单元及能力并停止服务。x86_64 和 ARM64 均已通过，原实验配置/能力恢复、专用服务停止、来宾正常关机。最终证据见 [正式模板报告](acceptance-deployment.json)；M5 在本次约定模拟环境范围内完成。

依据：[Linux proc_pid_exe](https://man7.org/linux/man-pages/man5/proc_pid_exe.5.html)、[Linux capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)、[systemd 能力集与系统调用过滤说明](https://github.com/systemd/systemd/blob/main/man/systemd.exec.xml)。
