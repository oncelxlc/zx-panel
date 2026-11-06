# v1.1 界面截图

2026-09-29，Chromium / Windows；确定性 MSW 演示数据，页面显示“演示数据”。这些截图验证界面，不证明 Linux 管理功能已实机通过。采集时启用减少动效，并等待真实图表和页面数据完成加载。

| 页面 | 桌面亮色 1440px | 桌面暗色 1440px | 移动亮色 390px | 移动暗色 390px |
| --- | --- | --- | --- | --- |
| 概览 | [查看](pages/overview-light-1440.png) | [查看](pages/overview-dark-1440.png) | [查看](pages/overview-light-390.png) | [查看](pages/overview-dark-390.png) |
| 运行时 | [查看](pages/runtimes-light-1440.png) | [查看](pages/runtimes-dark-1440.png) | [查看](pages/runtimes-light-390.png) | [查看](pages/runtimes-dark-390.png) |
| 应用与进程 | [查看](pages/apps-light-1440.png) | [查看](pages/apps-dark-1440.png) | [查看](pages/apps-light-390.png) | [查看](pages/apps-dark-390.png) |
| 监控 | [查看](pages/monitoring-light-1440.png) | [查看](pages/monitoring-dark-1440.png) | [查看](pages/monitoring-light-390.png) | [查看](pages/monitoring-dark-390.png) |
| 日志 | [查看](pages/logs-light-1440.png) | [查看](pages/logs-dark-1440.png) | [查看](pages/logs-light-390.png) | [查看](pages/logs-dark-390.png) |
| 设置 | [查看](pages/settings-light-1440.png) | [查看](pages/settings-dark-1440.png) | [查看](pages/settings-light-390.png) | [查看](pages/settings-dark-390.png) |

`breakpoints/` 另外保留概览两主题 × 1440/1280/1024/768/390px，共 10 张。完整验证及限制见 [验证记录](../verification.md)。

`wsl/` 为正式 API 内嵌前端连接 Ubuntu 24.04 WSL2 的真实采样：[亮色概览](wsl/overview-light.png)、[暗色概览](wsl/overview-dark.png)。界面中的失败/中断任务来自真实验收故障注入；没有把它们改成成功。该组与上面的 Mock 截图区分存放。
