# zx-panel · 产品设计与开发实现规范

> **仓库实施状态（2026-09-29）：** 本文保留原始 v1.1 设计基线。用户确认的 PostgreSQL、Base UI + Nova、现有目录/端口、`success/data/error` 与旧主题键适配见 [决定记录](decisions.md)，实际接口以 [OpenAPI](openapi.json) 为准。M0/M1 已通过本地验证；用户另授权 WSL 模拟实验，Ubuntu 24.04 WSL2 x86_64 与 QEMU ARM64 来宾已实测官方安装、systemd 应用、日志与 SSE 恢复；Linux race、数据库恢复及 30 分钟稳定性在 x86_64 通过。补充完成双架构临时授权下的完整引用检查和卸载，以及 x86_64 实际导出上限与首屏传输测量。临时权限均已撤销；用户随后明确批准正式 helper 模板，双架构正式模板安装/引用/卸载及收尾复验均通过，M0–M5 已完成约定的本地与 WSL/QEMU 验收。原生 ARM 性能和现有业务服务器部署不在本次已验证范围。已执行测试、截图、性能样本、模拟环境边界及开发库迁移事故见 [验证记录](verification.md)。本文的验收条目不因代码存在而自动视为通过。

> 版本：1.1  
> 编写日期：2026-09-28  
> 文档性质：可用于开发拆解、前后端联调与验收的实施基线。  
> 前端约束：React + TypeScript + shadcn/ui。  
> 后端约束：Go（Golang）+ Gin，使用 Go Modules 管理依赖。  
> 管理范围：仅管理 **zx-panel 所安装的当前服务器**。  
> 主题要求：白色系亮模式、黑色系暗模式；现代、克制、具有精密仪表感。

---

## 0. 如何使用本文档

阅读路径：产品与页面见第 1–6 章；前端主题、组件与类型见第 7–8 章；接口、任务、监控和安全见第 9–12 章；Go + Gin 后端落地见第 12.5–12.12 节；工程、构建部署与配置见第 13 章；验收与实施拆分见第 14–16 章。

**v1.1 修订摘要：**按已确认需求将后端固定为 Go + Gin；同步更新技术边界、Go 工程目录、DTO 与请求校验、持久任务与 SQLite、SSE 与服务生命周期、构建/配置/CLI、测试验收和开发任务说明。保留原有前端设计、双主题、单服务器范围与业务 API。

本文档是实施方案，不代表功能已经开发、接口已经存在或安全测试已经通过。优先级依次为：**用户明确要求 → 本文的产品边界与验收条目 → 接口契约 → 视觉示意图**。已有界面图只用于理解方向；其中的文字、版本、状态、数据、装饰不直接作为实现事实。

开发顺序建议：先实现主题与布局，再用确定性的 Mock 数据实现页面与状态，随后接入本机只读监控，最后接入安装、版本管理和应用控制。任何操作都必须在后端返回确认结果后才显示成功。

以下区分已确认约束与可调整工程决策。React + shadcn/ui、Go + Gin 与仅管理当前服务器是确定约束；其他工程基线需要调整时必须显式记录影响，不得静默替换：

| 决策 | 本文基线 | 边界说明 |
| --- | --- | --- |
| 首发部署 | 原生 Linux；完整应用管理依赖 systemd | 这是实施假设，并非用户已经指定的操作系统 |
| 首发运行时 | Node.js、Go 工具链 | Python 等后续扩展，不提前堆放空白菜单 |
| 后端 | **Go（Golang）+ Gin** | 用户已确定的技术约束；Gin 负责 HTTP 层，业务与本机操作独立分层 |
| 前端构建 | Vite SPA；发布静态资源由本机服务提供 | 不为此引入独立 SSR 服务 |
| 数据推送 | 同源 HTTP API + 单条主 SSE 流 | 不引入跨主机 Agent 或远程任务队列 |
| 状态持久化 | 本机 SQLite + `database/sql`；基线驱动 `modernc.org/sqlite` | 有限保留监控聚合与任务记录；不引入外部数据库或监控集群 |
| 服务端平台 | 启动时探测 OS、架构、libc、权限与 systemd | 不把“Linux”直接等同于“支持所有操作” |

所有尺寸、阈值、刷新间隔和性能预算都是本项目的设计目标，不是对尚未测试的软件的性能声明。技术参考见文末；框架实际版本由初始化时的兼容性验证与 lockfile 固定，不使用本文中的示例运行时版本推断“当前最新版”。

## 1. 产品目标与边界

### 1.1 一句话定位

**zx-panel 是安装在当前服务器上的轻量管理面板，用于查看本机状态、安装与管理运行时、管理本机受托管应用，并查看相关日志。**

用户应能够迅速回答三个问题：服务器是否正常、运行环境是否可用、需要处理什么操作或异常。

### 1.2 必须满足的需求

| 编号 | 需求 | 实现落点 |
| --- | --- | --- |
| R01 | 项目名称统一为 `zx-panel` | 浏览器标题、Logo、导航、登录页、设置、日志来源 |
| R02 | 管理对象只有当前服务器 | 单个 `/system/info`，不设计服务器列表或切换器 |
| R03 | 安装、更新、管理 Node.js / Go | 运行时列表、版本详情、安装预检、任务抽屉 |
| R04 | 显示服务器基本信息与资源监控 | 概览、监控页、数据时间与可用性状态 |
| R05 | React + shadcn/ui | UI 原语统一、页面按业务模块组织 |
| R06 | 白色亮模式、黑色暗模式 | 语义化主题变量、三态主题切换、全组件覆盖 |
| R07 | 独特、现代且有科技感 | 精密网格、等宽读数、细线刻度、少量信号色 |
| R08 | 不堆砌无关内容 | 有限导航、行动优先、无营销区和伪功能 |
| R09 | 后端使用 Go + Gin | Go Modules、Gin API、持久任务、本机适配器与最小权限辅助服务 |

### 1.3 首发范围

首发包含：本机概览；Node.js / Go 的已安装版本与可安装版本；面板管理目录内的多版本安装、默认版本设置与卸载；本机受托管应用启停与日志；系统进程只读查看；CPU、内存、磁盘和网络监控；任务记录；主题、显示偏好与面板基础设置。

以下功能不在首发范围：多服务器、SSH 连接、主机分组、远程 Agent、远程执行、云主机采购、Kubernetes、Docker 管理、站点与证书管理、数据库管理、系统包管理商店、文件管理器、交互式终端、系统升级/重启/关机、定时任务编排、用户组织管理、AI 助手、营销与营收数据。

范围外功能不在导航中显示“敬请期待”；后续批准后再添加。

### 1.4 “仅本机”的具体含义

- 后端只能对自身所在的操作系统执行受支持操作，不接受 `host`、`sshHost`、`remoteAddress` 等目标主机参数，也不提供 `hosts[]` 资源。
- 浏览器通过同源 API 访问该面板服务；“浏览器访问面板地址”与“面板管理另一台服务器”是不同概念。
- 安装运行时需要的官方版本元数据和安装包下载属于软件获取，不属于远程服务器管理。下载由本机后端完成，来源受允许列表约束。
- 无外网时保留本机监控和已安装版本管理；版本目录显示缓存时间。没有经过验证的缓存安装包时，不得显示“离线可安装”。
- 容器内运行只能看到受限的命名空间或挂载信息时，必须标明实际观测范围，不能把容器资源冒充整台服务器。首发完整管理按原生部署验收。

### 1.5 核心术语

| 术语 | 含义 | 禁止混淆 |
| --- | --- | --- |
| 运行时 / 工具链 | Node.js 执行环境、Go 编译工具链 | “已安装”不等于“有服务在运行” |
| 安装实例 | 某版本、架构、来源和路径对应的实际安装 | 同版本不同来源不能合并成一条可随意修改的记录 |
| 面板默认版本 | 新建面板托管应用/任务时的预选版本 | 不承诺修改系统所有用户的 PATH |
| 受托管应用 | 经面板登记并由指定服务机制管理的程序 | 不等同于系统所有进程 |
| 系统进程 | 本机操作系统报告的进程 | 未托管进程首发仅可查看 |
| 任务 | 一次可追踪的安装、卸载或应用操作 | HTTP 请求受理不等于任务成功 |
| 采集正常 | 监控数据按时到达 | 不等同于服务器和全部应用都健康 |

运行时管理页面中的 Go 以“工具链”呈现：安装 Go 不产生一个应当“启动”的 Go 后台服务；已编译的 Go 应用是独立二进制，更新工具链不会自动重编译或更新该应用。界面中不得给 Go 安装项设置“启动 Go”按钮。工具链与编译产物的区分可参照 Go 官方编译安装教程。[^s14]

## 2. 信息架构与导航

### 2.1 一级导航

```text
zx-panel
├─ 概览               /overview
├─ 运行时             /runtimes
│  ├─ Node.js         /runtimes/node
│  └─ Go              /runtimes/go
├─ 应用与进程         /apps
│  ├─ 托管应用        /apps?tab=managed
│  └─ 系统进程        /apps?tab=processes
├─ 监控               /monitoring
├─ 日志               /logs
└─ 设置               /settings
```

登录位于 `/login`，首次初始化位于 `/setup`；它们不属于侧边导航。`/` 重定向到 `/overview`。

任务抽屉是全局覆盖层，入口在顶栏；支持 `?task=<taskId>` 深链。应用详情位于 `/apps/:appId`，运行时安装面板可用 `?action=install` 打开。查询参数只储存非敏感筛选状态，不放令牌、环境变量或完整命令参数。

### 2.2 页面职责

| 页面 | 核心问题 | 主要内容 | 主要动作 |
| --- | --- | --- | --- |
| 概览 | 本机当前怎么样？ | 核心指标、趋势、主机信息、运行时摘要、近期任务 | 查看详情、处理失败任务 |
| 运行时 | 能安装什么、装了什么？ | Node.js / Go 列表、安装来源、版本状态 | 安装、检查更新、管理版本 |
| 运行时详情 | 哪个版本可用、被谁使用？ | 版本表、路径、默认标识、引用关系 | 安装、设为面板默认、卸载 |
| 应用与进程 | 哪些程序在运行？ | 托管应用、系统进程两个独立标签页 | 启动、停止、重启、查看日志 |
| 监控 | 资源变化在哪里？ | CPU、内存、磁盘、网络的分项图表 | 时间范围、设备选择、暂停显示 |
| 日志 | 错误发生在哪里？ | 应用日志、面板日志、操作审计 | 筛选、暂停、复制、受控导出 |
| 设置 | 如何调整面板本身？ | 外观、显示时区、数据保留、账号、关于 | 保存设置、修改密码、退出 |

不得同时存在“应用管理”“软件包管理”“运行环境管理”三个功能重叠的一级入口。

## 3. 视觉方向：精密本机控制台

### 3.1 设计语言

视觉关键词：**单色基底、精密对齐、克制信号、真实数据、清晰反馈**。

差异化来自三处：Logo 以小尺寸 `zx` 字形/折线构成；面板标题使用短刻度和细分隔线；数字区域采用等宽数字、清晰单位与统一基线。科技效果通过数据线、焦点态和真实状态表现，而不是增加背景特效。

不使用星球、粒子、霓虹边框、整页网格、持续扫描线、玻璃大面积模糊、彩虹渐变、浮动 3D 模型或装饰性代码雨。前序示意图中的星球背景、宣传说明、技术栈展示区和“欢迎回来”营销式大标题不进入实际管理页面。

### 3.2 配色角色

中性色覆盖绝大多数界面。主操作使用黑白高对比按钮；信号色只用于选中指示、图表主线、焦点及少量链接。危险操作保留红色，不拿品牌色代替错误语义。

| Token | 亮模式 | 暗模式 | 用途 |
| --- | --- | --- | --- |
| `background` | `#F7F8FA` | `#08090B` | 页面底色 |
| `card` | `#FFFFFF` | `#101114` | 内容面板 |
| `popover` | `#FFFFFF` | `#17191D` | 菜单、弹层 |
| `foreground` | `#17191D` | `#F3F4F6` | 主要文字 |
| `muted` | `#F1F3F5` | `#1A1C20` | 次级区域 |
| `muted-foreground` | `#5D6572` | `#A1A7B0` | 次级文字 |
| `border` | `#E2E5EA` | `#292D33` | 装饰性分隔与卡片边界 |
| `input` | `#7A8390` | `#737D8A` | 输入控件的可识别边界 |
| `primary` | `#17191D` | `#F3F4F6` | 主要按钮底色 |
| `primary-foreground` | `#FFFFFF` | `#101114` | 主要按钮文字 |
| `signal` | `#1D4ED8` | `#67E8F9` | 选中状态、焦点、主图表线 |
| `success` | `#166534` | `#86EFAC` | 成功、健康 |
| `warning` | `#854D0E` | `#FDE047` | 警告、待确认 |
| `danger` | `#B91C1C` | `#FCA5A5` | 错误、危险文字 |

暗模式必须整体呈黑色与炭灰色，而不是深蓝色背景。状态文字与淡色底成对使用；默认 Badge 不全部染成高饱和绿色。

### 3.3 字体、图标与尺寸

| 元素 | 规格 |
| --- | --- |
| 中文/正文 | 系统无衬线字体；14px / 22px；不依赖外部字体 CDN |
| 页面标题 | 24px / 32px，600 字重 |
| 区块标题 | 14px / 20px，600 字重 |
| 指标数字 | 30–32px / 36px，600 字重，`tabular-nums` |
| 说明与辅助标签 | 12px / 18px；不得仅因空间不足继续缩小 |
| 版本、PID、路径、日志 | 系统等宽字体；日志最低 12px / 20px |
| 图标 | Lucide 风格，常规 16px、导航 18px，统一笔画；无 Emoji 图标 |
| 间距 | 基础 4px；常用 8 / 12 / 16 / 24 / 32px |
| 卡片圆角 | 12px；输入/按钮 8px；Badge 6px |
| 按钮 | 桌面常规高度 36px；主表单 40px；移动触控区域至少 44px |
| 表格行高 | 常规 48px；日志为单独的高密度模式 |
| 边框 | 1px；浅阴影只用于悬浮层，暗模式不使用大片发光阴影 |

不要通过加粗所有文字制造层级；主要依赖字级、间距、位置和中性色差。

### 3.4 动效与无障碍

悬停与主题过渡为 120–160ms，弹层为 160–200ms。只有真实进行中的任务显示 Loading。监控曲线不在每次采样时重新播放整段动画，指标数字不滚动翻牌。

普通文字与背景的对比度按至少 4.5:1 验收；大字至少 3:1。装饰性边框不代替输入框边界或焦点环。上述文字对比度基线参照 WCAG 2.2 的说明。[^s09]

所有操作可通过键盘使用；焦点环清晰；图标按钮有 `aria-label`；弹窗有标题和描述，关闭后焦点回到触发元素。状态同时有文字与图标，不仅靠颜色。图表有可读摘要/数据表入口，日志自动刷新不逐行轰炸屏幕阅读器。遵循 `prefers-reduced-motion`，关闭非必要动效。

## 4. 页面布局与响应式

### 4.1 桌面壳层

目标设计画布：1440 × 900。它不是强制固定分辨率，页面必须自然流动。

```text
┌─ 224px Sidebar ─┬────────────────── Topbar 64px ──────────────────┐
│ zx-panel        │ 面包屑           搜索页面/应用  任务  主题  账号  │
│                 ├──────────────────────────────────────────────────┤
│ 概览            │ 页面标题 / 当前服务器 / 数据状态                 │
│ 运行时          │                                                  │
│ 应用与进程      │  [ CPU ]   [ 内存 ]   [ 根分区 ]   [ 网络 ]      │
│ 监控            │                                                  │
│ 日志            │  ┌────── 资源趋势：8列 ──────┬─ 本机信息：4列 ─┐ │
│                 │  │                            │                 │ │
│ 设置            │  └────────────────────────────┴─────────────────┘ │
│                 │  ┌──── 运行环境摘要：8列 ────┬─ 近期任务：4列 ─┐ │
│ 当前服务器      │  │                            │                 │ │
│ 实际主机名      │  └────────────────────────────┴─────────────────┘ │
└─────────────────┴──────────────────────────────────────────────────┘
```

侧边栏默认宽 224px、可收起到 64px；顶栏高 64px；内容区内边距 24px、区块间距 16px。主网格使用 12 列；最大内容宽度 1600px，超宽屏居中，不把长表单无限拉宽。

概览卡片建议最小高度 112px；资源趋势与系统信息建议最小高度 304px；运行环境与近期任务建议最小高度 200px。高度可因内容增长，禁止固定高度裁掉内容。首屏优先容纳指标与趋势，剩余内容自然下滚。

顶部展示真实主机名，未获取时为“读取本机信息…”。`localhost` 不是所有服务器的默认展示值。底部主机标识不带下拉箭头，不做服务器选择器。

### 4.2 响应式规则

| 视口 | 布局变化 |
| --- | --- |
| `≥1280px` | 224px 侧栏；指标 4 列；趋势/信息 8:4 |
| `1024–1279px` | 64px 图标侧栏；指标 4 列；趋势/信息可保持 7:5 |
| `768–1023px` | 侧栏改为可展开 Sheet；指标 2 列；内容主体 1 列 |
| `<768px` | 顶栏仅保留标题、任务、菜单；指标 2 列，`<400px` 改 1 列；表格局部横向滚动 |

小屏优先保证监控读取、日志与任务查看；危险确认仍保留完整影响说明。运行时详情 Sheet 宽度 `min(560px, 100vw)`，任务 Sheet 为 `min(640px, 100vw)`；移动端全宽。文案换行不能让页面整体产生横向滚动。

## 5. 页面规格

### 5.1 概览 `/overview`

标题为“概览”，副标题为“当前服务器 · {hostname}”。右侧显示“数据正常 / 数据延迟 / 采集不可用”，以及最近有效样本时间；不用一个未经定义的“健康分数”。

**第一层：四个指标。**

| 卡片 | 主值 | 次值 | 点击去向 |
| --- | --- | --- | --- |
| CPU | 总体使用率 `%` | 逻辑核数、1 分钟负载 | `/monitoring?tab=cpu` |
| 内存 | 使用率 `%` | 已用 / 总量，GiB | `/monitoring?tab=memory` |
| 根分区 | 指定挂载点的使用率 `%` | 已用 / 容量；明确标注 `/` 或实际挂载点 | `/monitoring?tab=disk` |
| 网络 | 下行速率 | 上行速率、当前网卡 | `/monitoring?tab=network` |

CPU、内存可显示极简 Sparkline；磁盘占用显示细进度条；网络使用上下行两条可区分的线。运行时间放在本机信息中，不占据高频监控卡片。

**第二层：资源趋势与本机信息。** 趋势默认 CPU、近 1 小时，可切换内存/磁盘/网络与 15 分钟/1 小时/24 小时。每次只突出一种指标；网络同时展示上下行。不在一个纵轴上混合百分比、字节和负载。

本机信息按两列键值展示：主机名、操作系统、内核、架构、CPU 型号及逻辑核数、内存、主要磁盘挂载点、启动时间与运行时长。地址信息在“展开详情”中读取已有网卡地址，不调用公网服务猜测公网 IP。字段不可读时显示“不可用”及原因。

**第三层：运行环境摘要与近期任务。** Node.js、Go 各一行：名称、面板默认版本、已安装版本数、外部安装提示、可用更新状态、管理入口。最多展示三条近期任务，失败优先于已完成。没有任务则显示一句空态，不填充虚构成功记录。

当存在可操作异常时，在标题下显示最多一条聚合提示，例如“1 个安装任务失败”，并跳转具体任务。无异常时不保留空白警报区。

### 5.2 运行时列表 `/runtimes`

标题“运行时”，说明“管理当前服务器的执行环境与工具链”；右侧“检查更新”。列表初始只显示 Node.js 与 Go，以紧凑横向卡片或两列表现。

每项显示名称、类型说明、面板默认版本、面板管理/外部发现的安装数、目录更新时间。没有安装时显示“未安装”，主按钮“安装”；已有安装时主按钮“管理版本”。只有目录检查成功且存在适配当前平台的更高版本时才显示“可更新”。

“检查更新”只刷新目录并做版本比较，不执行自动升级。更新目录失败时提示“检查失败，保留上次结果”，不能显示“已经是最新版”。

### 5.3 运行时详情 `/runtimes/:kind`

顶部展示名称、说明和主操作“安装版本”。下方只保留“已安装”“可安装”两个标签页；“相关设置”作为页内折叠区，而不是常驻空标签。

已安装表格：

| 字段 | 呈现规则 |
| --- | --- |
| 版本 | 等宽；默认 Badge 与受支持状态分开显示 |
| 来源 | `面板管理` 或 `外部发现` |
| 安装路径 | 中部截断、悬停显示、提供复制；不把不同路径当作同一实例 |
| 使用情况 | 托管应用引用数；检测到的执行进程另列；未知明确标注 |
| 安装状态 | 就绪、校验异常、不兼容、信息不完整 |
| 操作 | 设为面板默认、查看引用、卸载；不适用操作不出现或给出禁用原因 |

外部发现的 `/usr/bin/node`、系统包安装或用户版本管理器目录等默认只读；首发不自动接管，也不替换系统路径。`active` 不同时代表默认版本、应用运行与安装可用。

可安装表格显示版本、发布通道、平台、体积、兼容性、安装按钮。Node.js 的发布通道由经验证的目录适配器映射，不能给任意版本硬编码“LTS”；Go 不复用 Node.js 的 LTS 标签。Node.js 官方发布信息可作为版本通道与维护状态的数据依据。[^s10]

默认优先筛选“稳定且适配当前平台”的候选版本；目录发布时间或生命周期未知时不编造。最新版本来自后端目录，不来自前端常量。

### 5.4 安装与更新交互

点击安装打开 Sheet，字段包括：选中的运行时、具体版本、只读平台、只读安装根目录、下载体积/磁盘要求、来源、校验方式、安装后是否设为面板默认。

流程：**选择版本 → 后端预检 → 展示计划与影响 → 用户确认 → 创建任务 → 追踪进度 → 核验结果**。

安装默认不变更已有面板默认版本；第一次安装且当前无默认版本时，可预选“设为面板默认”，但必须显式展示。后续版本升级默认保留旧版本，不覆盖原目录、不自动迁移应用、不自动重启应用。

“更新”实际创建并行的新安装实例。需要迁移应用时，在应用详情选择目标版本并单独确认重启；不得用一个“更新全部”绕过影响确认。

Node.js 归档中的附属工具按实际探测结果展示；不默认声称 npm、pnpm、Yarn 或 Corepack 全部已安装。首发不提供全局包批量更新，避免把运行时升级与应用依赖升级混为一谈。

进度显示阶段和真实下载字节。未知总量时显示不定进度，不用定时器伪造百分比。成功面板展示实际安装版本、路径、校验结果和默认版本是否改变。

### 5.5 面板默认版本与卸载

设为面板默认前展示：“只影响后续新建的面板托管应用/任务的预选版本；已配置应用继续使用绑定的具体版本；不修改其他用户终端的 PATH。”默认值变更作为独立任务记录。

安装实例满足以下任一条件时阻止卸载：是面板默认；被托管应用的执行配置引用；存在确认仍使用它的执行进程；运行相关互斥任务；来源为外部发现；无法完成必要的占用检查。

未运行但仍配置引用该版本的应用也属于引用。Go 应用的历史构建版本信息不是运行期占用；但显式配置的未来构建任务引用需要另行保护。首发不实现自动构建任务，因而不伪造该引用类型。

卸载确认展示版本、路径、引用检查结果，要求输入具体版本文本；明确“仅移除该面板管理安装目录，不删除应用文件与日志”。不允许首发“强制卸载”。

### 5.6 应用与进程 `/apps`

**托管应用**表格字段：名称、类型、绑定运行时/二进制、状态、主 PID、CPU、内存、运行时长、操作。进程指标与应用指标分开：应用指标默认按应用服务的 cgroup 汇总；主 PID 只是定位信息，不代表所有子进程消耗。

状态为“运行中、已停止、启动中、停止中、失败、未知”。仅 systemd 活跃不能宣称业务健康；若没有配置并通过业务健康检查，状态文案只用“运行中”，不写“服务健康”。

主操作为“新建应用”。首发只支持：

1. **Node.js 应用**：名称、受控应用目录、入口 JS 文件、具体安装实例、参数数组、服务账号、重启策略、环境变量。
2. **本机二进制应用**：名称、受控应用目录、可执行文件路径、参数数组、服务账号、重启策略、环境变量；适用于已经部署到本机的 Go 编译产物等。

这里不实现 Git 拉取、构建流水线、文件上传或自动依赖安装。文件需预先存在于批准的应用根目录，表单预检必须验证路径、权限、入口和执行文件。服务账号来自后端允许列表，不允许前端任意指定 root。

启动、停止、重启是异步任务；停止和重启必须确认影响，创建配置不默认启动。删除仅用于已停止应用，删除前展示是否只移除托管配置；首发保留应用文件和日志。环境变量编辑只提交改变的项，已有秘密值不回显、不写入 URL、不进入浏览器持久缓存。

应用详情有“概况、配置、日志”；配置修改保存后显示“已保存，等待下次启动生效”，需要立即生效时由用户另行确认重启。运行时变更始终绑定具体安装实例。

**系统进程**表格字段：PID、进程名、用户、CPU、RSS、启动时间、父 PID。默认按 CPU 降序，可搜索名称/PID。未托管进程只读，无任意 kill/restart；检测到对应受托管应用时提供“打开应用”。不要把 `restart(pid)` 设计成通用进程功能。

### 5.7 监控 `/monitoring`

顶部统一控制时间范围、自动刷新、数据状态。页面按 CPU / 内存 / 磁盘 / 网络分组，使用 Tabs 避免同时铺满大图。

| 分组 | 必须展示 | 规则 |
| --- | --- | --- |
| CPU | 总体使用率、各核使用率、1/5/15 分钟负载 | 负载不是百分比，单独展示 |
| 内存 | 总量、使用量、可用量、缓存信息、Swap | 无 Swap 显示“未配置”，不是错误 |
| 磁盘 | 挂载点容量、可用空间、使用率、设备读写速率 | 容量与 I/O 分图；过滤策略明确 |
| 网络 | 网卡选择、接收/发送速率、累计字节 | 默认选主路由网卡，避免重复叠加虚拟接口 |

图表有单位、时间轴、悬停值、当前值和缺口。初装未积累历史时显示“已采集 8 分钟”，不得用随机数据填满 24 小时。暂停只停止前端自动展示，文案为“显示已暂停”；后端采集按既定策略继续。

### 5.8 日志 `/logs`

日志源限定为：面板服务日志、托管应用日志、操作审计；只有后端显式支持并授权时才展示系统日志。通过服务端提供的 `sourceId` 访问，不接受浏览器提供任意文件路径。

历史日志响应为 `{ items, nextCursor, tailCursor }`：`nextCursor` 用于向更旧记录翻页，`tailCursor` 用于后续实时续接，不能混用。游标绑定来源与筛选范围，不是任意日志读取凭证。日志流使用 `logs.batch` 事件，payload 为 `{ sourceId, records: LogRecord[], cursor, droppedCount }`；轮转或游标失效使用 `logs.reset`，界面显式标记缺口并重新读取，不能无提示跳过。

工具栏包含来源、级别、时间范围、纯文本搜索、暂停、自动滚动和导出。日志主体为等宽文本区：亮模式浅色日志面板，暗模式黑灰面板；不是在亮模式中强行放一块巨大的黑色终端。

暂停时保留当前位置并显示新增行计数。用户向上滚动时关闭跟随，出现“回到最新”按钮。复制只复制选中记录；导出必须经过权限校验，默认受时间范围和大小限制。禁止把日志当 HTML 渲染，ANSI 只允许安全颜色子集，不执行链接控制序列。错误信息保留必要上下文，屏蔽密码、令牌和秘密环境变量。

### 5.9 设置 `/settings`

分为外观、数据显示、存储与保留、账号安全、关于。外观含亮/暗/跟随系统，默认跟随系统；密度首发只提供标准，不做无意义的皮肤选择。

显示时区默认“服务器时区”，可切换浏览器时区或已选择的 IANA 时区；接口时间统一 UTC。禁止将设计样例中的日期或时区写死为用户机器配置。

存储与保留展示当前占用与受限保留策略；运行时目录首发只读，修改需按服务端部署配置完成，不做一键移动已安装目录。账号安全含修改密码、退出登录；不引入组织、邀请、多租户页面。

## 6. 全局交互、状态与文案

### 6.1 通用状态矩阵

| 状态 | 页面行为 | 禁止行为 |
| --- | --- | --- |
| 初次加载 | 使用与最终布局一致的 Skeleton | 大面积闪动或全屏 Loading 无限等待 |
| 空数据 | 说明原因与单个合理动作 | 随机样例冒充真实数据 |
| 加载失败 | 局部错误、重试、请求 ID | 所有卡片一起清空 |
| 数据过期 | 保留最后值，标时间，弱化趋势末端 | 显示为 0 或继续宣称“实时” |
| 权限不足 | 显示原因并禁用相关操作 | 只在前端隐藏，后端仍允许 |
| 平台不支持 | 展示已探测能力及原因 | 创建必然失败的任务 |
| 操作中 | 资源级禁用冲突操作，显示任务入口 | 锁死整个应用或制造重复任务 |
| 部分失败 | 明确哪些步骤已完成、实际当前状态 | 用一个成功 Toast 掩盖失败 |

### 6.2 搜索与全局入口

顶栏 Command Palette 用于跳转页面、搜索已安装运行时和受托管应用。占位文字为“搜索页面、运行时或应用…”，不写“输入命令…”。`Ctrl/Cmd + K` 打开，`Esc` 关闭；危险操作只能打开对应确认流程，不能从搜索结果直接执行。

全局任务入口只显示实际进行中的数量。点击打开任务抽屉，运行中在前，失败其次，完成最后。关闭抽屉不取消任务；离开页面后任务继续在本机后端执行，再次打开从后端恢复状态。

### 6.3 操作反馈

成功提示示例：“Node.js 安装完成”“面板默认版本已更新”“应用已停止”。失败提示包含事实与下一步，例如：“磁盘空间不足，尚未开始安装。请释放空间后重试。”

不使用“运行时启动成功”“全部正常”“更新成功”这样的含糊文案。提交按钮显示“正在提交”，任务运行显示具体阶段；两者分开。

同一错误只产生一次全局提示，详情保留在资源页与任务记录中。所有写操作有未保存提醒或明确保存按钮；主题切换可即时持久化，无需保存。

普通错误、警告、成功与信息反馈统一使用项目现有的 shadcn Base UI Toast：右上角显示，默认折叠，悬停或键盘聚焦时展开，最多同时展示 8 条。状态驱动的通知按稳定标识更新，关闭后不会因普通重渲染反复弹出。字段校验、预检风险与阻断原因、危险操作/未保存确认、局部读取失败的重试与请求编号、任务错误记录，以及观测/只读范围和日志缺口/裁剪计数继续在原上下文展示；静态表单说明和资源状态不作为临时通知。

## 7. 前端实现规范

### 7.1 技术选型与初始化

| 层 | 选型/约束 | 用法 |
| --- | --- | --- |
| UI | React + TypeScript，开启 strict | 页面组合与明确类型边界 |
| 构建 | Vite | 单页应用、路由级懒加载 |
| 基础组件 | shadcn/ui，同一套 Radix 基础原语 | 不混用不同原语实现的相似组件 |
| 样式 | Tailwind CSS + CSS 自定义变量 | 统一语义 Token，禁止页面内硬编码主题色 |
| 服务端状态 | TanStack Query | 缓存、请求状态、失效与刷新 |
| 路由 | React Router | 资源详情、搜索条件、抽屉深链 |
| 图表 | shadcn Chart + 其兼容的 Recharts | 主题随 Token 切换，图表按需加载 |
| 表单 | React Hook Form + Zod | 客户端即时校验；后端仍重新校验 |
| 图标 | Lucide React | 按需导入，不加载无关图标全集 |
| 测试 | Vitest、Testing Library、Playwright | 单元、组件、端到端与视觉回归 |

初始化按 shadcn/ui 官方 Vite 流程执行，选择 React + TypeScript、Neutral 基色和一致的组件原语。提交 lockfile、`components.json` 与实际生成的 UI 源码，CI 使用冻结依赖安装；不要每次构建都重新执行 `@latest`。[^s01]

```bash
# 仅在初始化工作目录执行；按 CLI 提示创建项目，然后进入项目目录。
pnpm dlx shadcn@latest init -t vite

# 在生成的项目目录中添加所需组件。
pnpm dlx shadcn@latest add button card badge input label select tabs table \
  dropdown-menu dialog alert-dialog sheet command tooltip skeleton \
  progress scroll-area separator switch checkbox sidebar chart
```

命令中的 `@latest` 仅用于初始化选择，实际可重现依赖以随后提交的 lockfile 为准。已有 React 项目应走官方“Existing Project”流程，不覆盖其已有目录。为真实接口制定兼容性测试后再升级库。

### 7.2 主题 Token 代码

shadcn/ui 以语义 CSS 变量为组件主题入口；本项目保留其标准 Token 映射，并替换下面的值。[^s02] Tailwind 的手动暗模式使用 `.dark` 选择器，按当前官方文档配置。[^s03]

**集成方法：** 保留初始化生成的 CSS imports、标准 `@theme inline` 颜色映射和基础组件样式；用下列 `:root` / `.dark` 替换生成的同名主题块，将自定义映射合并到原有 `@theme inline`。下面的半径映射覆盖原有同名半径项。不要在 Hex 变量外再套 `hsl(...)`。

```css
/* src/styles/theme.css — 合并到入口样式；不要重复保留冲突的主题值。 */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  color-scheme: light;
  --background: #f7f8fa;
  --foreground: #17191d;
  --card: #ffffff;
  --card-foreground: #17191d;
  --popover: #ffffff;
  --popover-foreground: #17191d;
  --primary: #17191d;
  --primary-foreground: #ffffff;
  --secondary: #f1f3f5;
  --secondary-foreground: #17191d;
  --muted: #f1f3f5;
  --muted-foreground: #5d6572;
  --accent: #edf1f6;
  --accent-foreground: #17191d;
  --border: #e2e5ea;
  --input: #7a8390;
  --signal: #1d4ed8;
  --signal-soft: #eff6ff;
  --ring: #1d4ed8;
  --success: #166534;
  --success-soft: #f0fdf4;
  --warning: #854d0e;
  --warning-soft: #fffbeb;
  --danger: #b91c1c;
  --danger-soft: #fef2f2;
  --destructive: #b91c1c;
  --destructive-foreground: #ffffff;
  --chart-1: #1d4ed8;
  --chart-2: #0e7490;
  --chart-3: #6d28d9;
  --chart-4: #4b5563;
  --chart-5: #854d0e;
  --sidebar: #ffffff;
  --sidebar-foreground: #17191d;
  --sidebar-primary: #17191d;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #edf1f6;
  --sidebar-accent-foreground: #17191d;
  --sidebar-border: #e2e5ea;
  --sidebar-ring: #1d4ed8;
  --radius: 0.75rem;
}

.dark {
  color-scheme: dark;
  --background: #08090b;
  --foreground: #f3f4f6;
  --card: #101114;
  --card-foreground: #f3f4f6;
  --popover: #17191d;
  --popover-foreground: #f3f4f6;
  --primary: #f3f4f6;
  --primary-foreground: #101114;
  --secondary: #1a1c20;
  --secondary-foreground: #f3f4f6;
  --muted: #1a1c20;
  --muted-foreground: #a1a7b0;
  --accent: #22262c;
  --accent-foreground: #f3f4f6;
  --border: #292d33;
  --input: #737d8a;
  --signal: #67e8f9;
  --signal-soft: #102c32;
  --ring: #67e8f9;
  --success: #86efac;
  --success-soft: #11281b;
  --warning: #fde047;
  --warning-soft: #30270c;
  --danger: #fca5a5;
  --danger-soft: #32181c;
  --destructive: #991b1b;
  --destructive-foreground: #ffffff;
  --chart-1: #67e8f9;
  --chart-2: #93c5fd;
  --chart-3: #c4b5fd;
  --chart-4: #a1a7b0;
  --chart-5: #fde047;
  --sidebar: #0b0c0f;
  --sidebar-foreground: #f3f4f6;
  --sidebar-primary: #f3f4f6;
  --sidebar-primary-foreground: #101114;
  --sidebar-accent: #1a1c20;
  --sidebar-accent-foreground: #f3f4f6;
  --sidebar-border: #292d33;
  --sidebar-ring: #67e8f9;
}

@theme inline {
  /* 其余 shadcn 标准映射保留在初始化生成的文件中。 */
  --color-signal: var(--signal);
  --color-signal-soft: var(--signal-soft);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-warning: var(--warning);
  --color-warning-soft: var(--warning-soft);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-destructive-foreground: var(--destructive-foreground);
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}

.metric-value, .numeric {
  font-variant-numeric: tabular-nums;
}

.zx-panel-surface {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  color: var(--card-foreground);
}

@media (prefers-reduced-motion: reduce) {
  .zx-motion {
    animation: none !important;
    transition: none !important;
  }
}
```

状态 Badge 示例类：`bg-success-soft text-success`。危险按钮使用 `bg-destructive text-destructive-foreground`，危险文本使用 `text-danger`；不要把适合浅底文字的颜色直接用于实心按钮背景。必须覆盖 Button、Input、Select、Tabs、Table、Dialog、Sheet、Tooltip、Chart、Toast、Skeleton、Scrollbar 的两种主题。

### 7.3 主题逻辑

`ThemePreference = 'light' | 'dark' | 'system'`；持久键为 `zx-panel.theme`。在首次绘制前读取并校验该值，再依据系统主题切换 `document.documentElement.classList`；设置 `color-scheme`，避免表单控件颜色不一致。React 初始化读取相同结果，不先画亮色再切暗色。

仅在 preference 为 `system` 时响应 `matchMedia('(prefers-color-scheme: dark)')` 的变化；手动选择的偏好不被系统覆盖。storage 读取失败时回退系统模式；监听其他标签页的 storage 变更。监听器必须清理，主题切换不能重建图表数据或重新请求全部接口。ThemeProvider 的组织方式可参照 shadcn/ui 的 Vite 暗模式文档。[^s04]

首帧脚本使用 CSP nonce/hash 或同源外部引导文件，不为了免闪烁放开任意 inline script。

### 7.4 组件分层

```text
AppProviders
├─ ThemeProvider
├─ QueryClientProvider
├─ AuthSessionProvider
└─ RouterProvider
   ├─ SetupPage / LoginPage
   └─ ProtectedAppShell
      ├─ AppSidebar
      ├─ AppTopbar
      ├─ CapabilityBanner
      ├─ RouteOutlet
      ├─ CommandPalette
      ├─ GlobalTaskSheet
      └─ ToastViewport
```

`ui/` 只存基础组件；`shared/` 放跨页面业务组件；`features/` 放运行时、应用、监控、日志各自的领域逻辑。组件不得直接拼接系统命令或根据页面位置决定权限。

| 业务组件 | 基础组件组合 | 关键输入 |
| --- | --- | --- |
| `MetricCard` | Card + Tooltip | value、unit、status、sampleTime |
| `RuntimeSummary` | Card + Badge + Button | installations、catalogStatus |
| `RuntimeVersionTable` | Table + DropdownMenu + Badge | rows、capabilities、busyResources |
| `OperationReviewSheet` | Sheet + Alert + Button | plan、expiry、warnings |
| `DangerActionDialog` | AlertDialog + Input | resourceLabel、impact、confirmationText |
| `ResourceChart` | ChartContainer + Recharts | metric、range、series、quality |
| `LogViewer` | ScrollArea + 虚拟列表 | records、paused、cursor、droppedCount |
| `TaskDetail` | Progress + Badge + ScrollArea | task、events、canCancel |
| `EmptyState` / `ErrorState` | 自有排版 + Button | title、description、action |

图表引用 CSS 变量，如 `stroke="var(--chart-1)"`；容器必须有可计算高度。shadcn Chart 基于 Recharts，并提供配合主题与 Tooltip 的组件；具体 props 应与锁定版本一致。[^s06]

### 7.5 状态管理与缓存

服务端事实放 TanStack Query；URL 放标签页、搜索、时间范围；组件内部放弹窗是否打开、输入草稿、是否暂停显示。只在跨页面确有需要时引入额外状态库。不要把同一安装列表复制到 Context、局部 state 与 Query 三份。

可推导状态直接计算，例如 `canUninstall = capability && !isDefault && references === 0 && ownership === 'panel'` 只能作为前端提示；是否允许仍以后端预检为准。表单与任务状态使用枚举/判别联合，避免多个布尔值组成矛盾状态。这与 React 官方关于避免冗余与不可能状态的指导一致。[^s05]

Query key 基线：

```text
['system', 'info']
['system', 'capabilities']
['metrics', 'latest']
['metrics', 'history', metric, deviceId, from, to, stepSeconds]
['runtimes', kind, 'installations']
['runtimes', kind, 'catalog', filters]
['apps', filters]
['app', appId]
['tasks', filters]
```

系统信息 `staleTime=60s`，能力信息 `30s`，安装列表 `15s`，版本目录 `10min`；任务运行时 `0` 或由事件驱动。前台实时指标由 SSE 更新；仅断流时启用轮询。手动检查更新主动失效目录缓存。Query 的默认 stale/refetch/retry 行为应显式配置，避免后台重复请求。[^s07]

安装、卸载、默认切换与应用控制不做“先假装成功”的乐观更新。可立即显示“任务已提交”，随后以任务终态与刷新后的资源快照为准。401/403/422 不自动重试；读取接口的网络/5xx 最多重试两次；写请求超时按原幂等键查询或重发，不换新键盲目重复执行。

## 8. 核心数据模型

以下是核心 TypeScript 契约，可作为 OpenAPI/运行时 Schema 的建模起点。Go + Gin 后端以明确 DTO 实现相同契约，映射规则见第 12.8 节。服务端与前端必须共享字段、枚举、单位与错误码；仅靠 TypeScript 不会校验网络输入，API 边界还需要运行时校验。

所有时间是 UTC ISO 8601 字符串；百分比为数值 `0–100`，`null` 表示不可用；字节值使用非负安全整数，超出 JS 安全整数的累计计数使用十进制字符串。版本与资源 ID 均由后端返回，前端不自行拼接磁盘路径。

```ts
export type ISODateTime = string;
export type RuntimeKind = 'node' | 'go';
export type ThemePreference = 'light' | 'dark' | 'system';
export type DataQuality = 'ok' | 'warming-up' | 'unavailable';

export interface ApiMeta {
  requestId: string;
  serverTime: ISODateTime;
}

export type ApiResponse<T> =
  | { ok: true; data: T; meta: ApiMeta }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
      meta: ApiMeta;
    };

export interface Capability {
  enabled: boolean;
  reasonCode: string | null;
  message: string | null;
}

export interface SystemCapabilities {
  readMetrics: Capability;
  installRuntime: Capability;
  changeRuntimeDefault: Capability;
  uninstallRuntime: Capability;
  manageApps: Capability;
  readProcesses: Capability;
  readLogs: Capability;
  exportLogs: Capability;
  editSettings: Capability;
}

export interface SystemInfo {
  hostname: string;
  os: { name: string; version: string; kernel: string };
  architecture: string;
  libc: { family: string; version: string | null } | null;
  cpuModel: string | null;
  logicalCpuCount: number;
  memoryTotalBytes: number | null;
  bootId: string;
  bootedAt: ISODateTime;
  uptimeSeconds: number;
  serverTimezone: string;
  observationScope: 'host' | 'container' | 'restricted';
  appSupervisor: 'systemd' | 'none';
  runtimeRoot: string;
  appRoots: string[];
  serviceAccounts: string[];
}

export interface MetricValue {
  value: number | null;
  quality: DataQuality;
  reasonCode: string | null;
}

export interface MetricSnapshot {
  sampledAt: ISODateTime;
  bootId: string;
  sequence: number;
  intervalMs: number;
  cpuUsagePercent: MetricValue;
  cpuPerCorePercent: MetricValue[];
  loadAverage: { one: number; five: number; fifteen: number } | null;
  memory: {
    totalBytes: number | null;
    usedBytes: number | null;
    availableBytes: number | null;
    usagePercent: MetricValue;
    swapTotalBytes: number | null;
    swapUsedBytes: number | null;
  };
  filesystems: Array<{
    id: string;
    mountPoint: string;
    sampledAt: ISODateTime; // 文件系统容量实际采集时间，不复用快照发送时间。
    totalBytes: number | null;
    usedBytes: number | null;
    freeBytes: number | null;
    availableBytes: number | null;
    usagePercent: MetricValue;
  }>;
  blockDevices: Array<{
    id: string;
    name: string;
    readBytesPerSecond: MetricValue;
    writeBytesPerSecond: MetricValue;
  }>;
  networks: Array<{
    id: string;
    name: string;
    isPrimary: boolean;
    rxBytesPerSecond: MetricValue;
    txBytesPerSecond: MetricValue;
    rxTotalBytes: string | null;
    txTotalBytes: string | null;
  }>;
}

export interface HistoryResponse {
  metric: string;
  unit: 'percent' | 'bytes' | 'bytes-per-second' | 'load';
  deviceId: string | null;
  stepSeconds: number;
  availableFrom: ISODateTime | null;
  points: Array<{
    at: ISODateTime;
    avg: number | null;
    min: number | null;
    max: number | null;
    sampleCount: number;
  }>;
}

export interface RuntimeInstallation {
  id: string;
  kind: RuntimeKind;
  version: string;
  architecture: string;
  path: string;
  ownership: 'panel' | 'external';
  state: 'ready' | 'broken' | 'incompatible' | 'unknown';
  isPanelDefault: boolean;
  configuredAppRefs: number;
  observedProcessRefs: number | null;
  referenceCheckComplete: boolean;
  installedAt: ISODateTime | null;
  revision: string;
}

export interface RuntimeRelease {
  id: string;
  kind: RuntimeKind;
  version: string;
  channel: 'lts' | 'current' | 'stable' | 'prerelease' | 'unknown';
  maintenance: 'supported' | 'eol' | 'unknown';
  platform: string;
  downloadBytes: number | null;
  installedBytesEstimate: number | null;
  compatible: boolean;
  incompatibilityReason: string | null;
  verifiedArtifactCached: boolean;
}

export type AppExecution =
  | {
      kind: 'node';
      runtimeInstallationId: string;
      entryFile: string;
      args: string[];
    }
  | {
      kind: 'binary';
      executablePath: string;
      args: string[];
      buildToolchainLabel: string | null; // 说明信息，不代表运行期依赖。
    };

export interface AppDraft {
  name: string;
  workingDirectory: string;
  runAsUser: string;
  execution: AppExecution;
  restartPolicy: 'no' | 'on-failure';
}

export interface ManagedApp extends AppDraft {
  id: string;
  revision: string;
  unitName: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'unknown';
  mainPid: number | null;
  startedAt: ISODateTime | null;
  cpuUsagePercent: number | null; // 以单核为 100%，可超过 100%。
  memoryBytes: number | null; // 应用 cgroup 占用；不伪装成单进程 RSS。
  environmentKeys: Array<{ name: string; secret: boolean }>;
  pendingRestart: boolean;
}

export type EnvironmentChange =
  | { action: 'set'; key: string; value: string; secret: boolean }
  | { action: 'remove'; key: string };

export type OperationSpec =
  | { action: 'runtime.install'; releaseId: string; makeDefault: boolean }
  | { action: 'runtime.set-default'; installationId: string; expectedRevision: string }
  | { action: 'runtime.uninstall'; installationId: string; expectedRevision: string }
  | { action: 'app.create'; app: AppDraft; environmentChanges: EnvironmentChange[] }
  | { action: 'app.update'; appId: string; expectedRevision: string;
      app: AppDraft; environmentChanges: EnvironmentChange[] }
  | { action: 'app.start' | 'app.stop' | 'app.restart' | 'app.delete';
      appId: string; expectedRevision: string };

export interface OperationPlan {
  id: string;
  action: OperationSpec['action'];
  expiresAt: ISODateTime;
  resourceIds: string[];
  summary: string;
  warnings: Array<{ code: string; message: string }>;
  blockedReasons: Array<{ code: string; message: string }>;
  confirmationText: string | null;
  canExecute: boolean;
}

export interface Task {
  id: string;
  action: OperationSpec['action'] | 'catalog.refresh' | 'logs.export';
  resourceIds: string[];
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'interrupted';
  stage: string;
  revision: number;
  progress: { completedBytes: number | null; totalBytes: number | null };
  canCancel: boolean;
  cancelRequestedAt: ISODateTime | null;
  createdAt: ISODateTime;
  startedAt: ISODateTime | null;
  finishedAt: ISODateTime | null;
  result: Record<string, unknown> | null;
  error: { code: string; message: string; recoverable: boolean } | null;
}

export interface ProcessItem {
  pid: number;
  ppid: number;
  startedAt: ISODateTime;
  processKey: string; // 后端以 bootId + PID + 启动标识构成，避免 PID 复用。
  name: string;
  user: string | null;
  cpuPercent: number | null;
  rssBytes: number | null;
  appId: string | null;
}

export interface LogRecord {
  id: string;
  sourceId: string;
  at: ISODateTime;
  level: 'debug' | 'info' | 'warn' | 'error' | 'unknown';
  message: string;
  truncated: boolean;
}
```

模型补充约束：`go` 目录适配器不能返回 `channel='lts'`；`ownership='external'` 不可设置为面板默认或卸载；状态不是 `ready` 的安装不能供应用选择。只读应用响应不得包含环境变量值。

## 9. HTTP API 与联调契约

### 9.1 通用约定

Base path 为 `/api/v1`；除文件下载和 SSE 外，统一返回 `ApiResponse<T>`。资源 ID 为不透明字符串。成功读取返回 200，同步创建返回 201，异步操作受理返回 202；**202 仅表示已受理**。后端拒绝未知写入字段，防止悄悄接受远程目标或任意执行参数。

列表使用 `{ items, nextCursor }`，`limit` 默认 50、最大 200；日志有单独上限。目录额外带 `checkedAt`、`cacheState: fresh|stale|unavailable`。所有写请求校验会话、Origin/Host、CSRF 与动作权限。

### 9.2 接口清单

| 方法与路径 | 请求/主要返回 | 说明 |
| --- | --- | --- |
| `GET /auth/session` | authenticated、user/null、csrfToken、expiresAt/null | 未登录也仅返回最小会话信息，不泄露主机数据 |
| `GET /setup/status` | setupRequired | 不允许借此读取系统信息 |
| `POST /auth/setup` | 一次性初始化凭据、用户名、密码 | 原子化消费本机生成凭据，完成后禁用 |
| `POST /auth/login` | username、password | 登录成功轮换会话 |
| `POST /auth/logout` | 空对象 | 服务端注销会话并关闭其流 |
| `POST /auth/password` | currentPassword、newPassword | 重新认证；使旧会话失效 |
| `GET /bootstrap` | system、capabilities、latestMetrics、activeTasks、streamCursor、streamEpoch | 登录后首屏与流衔接 |
| `GET /system/info` | SystemInfo | 单台本机信息 |
| `GET /system/capabilities` | SystemCapabilities | 操作前也重新验证，不能只依赖缓存 |
| `GET /metrics/latest` | MetricSnapshot | SSE 失败时的轮询后备 |
| `GET /metrics/history` | metric、deviceId、from、to、stepSeconds → HistoryResponse | 服务端约束指标/时间/点数 |
| `GET /runtimes` | 按 kind 分组的运行时摘要 | 安装状态与目录状态分开 |
| `GET /runtimes/:kind/installations` | RuntimeInstallation[] 的分页结果 | 返回真实路径与来源 |
| `GET /runtimes/:kind/releases` | RuntimeRelease[] + 目录时间/缓存状态 | 前端不直接访问上游版本源 |
| `GET /runtime-installations/:id/references` | 配置引用、已观测进程、检查完整性 | 决定能否卸载的输入之一 |
| `POST /runtimes/catalog/refresh` | kinds → Task | 刷新目录，不执行升级；要求幂等键 |
| `POST /operations/preview` | OperationSpec → OperationPlan | 预检，不改变运行时或应用状态 |
| `POST /operations` | planId、confirmationText → Task | 执行已确认计划；要求幂等键 |
| `GET /apps` | filter、cursor、limit → ManagedApp 列表 | 不能返回秘密值 |
| `GET /apps/:id` | ManagedApp | 配置修改走统一操作计划 |
| `GET /processes` | search、sort、cursor、limit → ProcessItem 列表 | 只读，不提供任意 PID 控制接口 |
| `GET /tasks` | status、cursor、limit → Task 列表 | 所有结果按会话权限过滤 |
| `GET /tasks/:id` | Task | 刷新浏览器后恢复任务 |
| `GET /tasks/:id/logs` | cursor、limit → 脱敏阶段日志 | 抽屉可见时按需拉取 |
| `POST /tasks/:id/cancel` | 空对象 → Task | 只对可安全取消的任务生效 |
| `GET /events` | after → 主 SSE 流 | 指标、任务变更、资源失效事件 |
| `GET /logs/sources` | id、label、capabilities 列表 | 不接受任意磁盘路径 |
| `GET /logs` | sourceId、from、to、level、search、cursor、limit | 每批最多 500 条、总字节受限 |
| `GET /logs/stream` | sourceId、after → 日志 SSE 流 | 仅当前日志视图使用，离开后关闭 |
| `POST /logs/exports` | 同查询筛选 → Task | 受控导出；要求幂等键 |
| `GET /logs/exports/:id/download` | 验证身份后的文件流 | 临时文件，默认 10 分钟后失效 |
| `GET /settings` | 非敏感面板设置、revision | 不暴露密码哈希、密钥或内部秘密路径 |
| `PATCH /settings` | expectedRevision、受允许字段 | 原子保存；主题本地偏好无需调用 |

表中的路径均以 `/api/v1` 为前缀。登录、设置等低延迟控制请求可同步完成；运行时和应用的有副作用操作必须经过计划与任务，不存在第二套绕过预检的 CRUD 写接口。

### 9.3 安装请求示例

下面所有 ID 都是契约样例，不是可直接用于真实服务器的资源。

```http
POST /api/v1/operations/preview
Content-Type: application/json
X-CSRF-Token: <session-csrf-token>

{
  "action": "runtime.install",
  "releaseId": "release-node-demo-linux-x64",
  "makeDefault": false
}
```

```json
{
  "ok": true,
  "data": {
    "id": "plan-demo-001",
    "action": "runtime.install",
    "expiresAt": "2026-09-28T14:25:00Z",
    "resourceIds": ["runtime:node"],
    "summary": "安装所选 Node.js 版本，保留已有版本与默认设置",
    "warnings": [],
    "blockedReasons": [],
    "confirmationText": null,
    "canExecute": true
  },
  "meta": {
    "requestId": "req-demo-001",
    "serverTime": "2026-09-28T14:24:00Z"
  }
}
```

```http
POST /api/v1/operations
Content-Type: application/json
X-CSRF-Token: <session-csrf-token>
Idempotency-Key: <uuid-created-once-for-this-confirmation>

{"planId":"plan-demo-001","confirmationText":null}
```

受理返回 202，`data` 为初始 `Task`。若请求超时，客户端以同一幂等键与同一 payload 重发；不能创建新键后再次点击。服务器必须先检查既有幂等结果，再检查计划是否过期，保证成功提交后丢失响应的请求仍能取回原任务。

### 9.4 预检、幂等与并发

预检计划默认 60 秒有效，绑定操作人、具体动作、资源版本、平台、目录条目与影响范围。敏感环境变量仅加密短期保存，不回传计划；计划过期后清除秘密内容；受理时将执行所需输入转入独立的受控加密任务输入，不能让排队任务依赖已经过期的计划。应用配置安全落库或任务终止后清理不再需要的任务秘密副本。点击执行时后端再次验证权限、资源引用、版本和磁盘空间；预检不是永久执行许可。

同一计划只能产生一个执行任务。幂等记录按“操作人 + 幂等键”保存至少 24 小时；同键同请求返回原结果，同键不同 payload 返回 `IDEMPOTENCY_CONFLICT`。已执行计划换新键再次提交返回原任务或明确 `PLAN_ALREADY_EXECUTED`，不能重复执行。

并发控制基线：同一安装实例及其引用变更互斥，同一运行时默认值变更串行，同一应用的配置/生命周期操作串行；安装器重任务全局并发 1。需要多个锁时按资源 ID 固定顺序获取。任务真正执行时再次预检，避免排队期间状态已经变化。

### 9.5 错误码与前端行为

| HTTP / code | 场景 | 前端反馈 |
| --- | --- | --- |
| 400 `MALFORMED_JSON` | 空正文、结构损坏、重复键或多段 JSON | 修正请求，不进入业务执行 |
| 401 `AUTH_REQUIRED` | 会话过期 | 停止重试、关闭流、回到登录页并保留非敏感返回路由 |
| 403 `FORBIDDEN` / `CSRF_INVALID` | 权限或请求校验失败 | 不执行任务，不自动重放危险动作 |
| 404 `RESOURCE_NOT_FOUND` | 资源不存在 | 关闭过期详情并刷新列表 |
| 405 `METHOD_NOT_ALLOWED` | 已存在路径使用了不支持的方法 | 返回 JSON 与正确 `Allow`，不得返回 SPA HTML |
| 409 `RESOURCE_BUSY` | 冲突任务执行中 | 显示冲突任务入口 |
| 409 `VERSION_IN_USE` | 安装仍被引用 | 展示引用清单，不提供强制卸载 |
| 409 `REVISION_CONFLICT` | 资源已改变 | 重新加载并重新预检 |
| 409 `PLAN_EXPIRED` | 计划过期 | 重新预检，重新确认影响 |
| 409 `IDEMPOTENCY_CONFLICT` | 幂等键被不同请求复用 | 报告客户端状态错误，不自动生成新任务 |
| 413 `BODY_TOO_LARGE` | 请求体超出限额 | 提示缩小输入，不盲目重试 |
| 415 `UNSUPPORTED_MEDIA_TYPE` | 写入媒体类型不是允许的 JSON | 修正 Content-Type，不自动转表单提交 |
| 422 `UNSUPPORTED_PLATFORM` | 没有兼容构建或能力 | 显示平台原因与只读范围 |
| 422 `INVALID_INPUT` / `INVALID_PATH` | 输入或路径不合法 | 对应字段错误，不只弹 Toast |
| 422 `EXTERNAL_INSTALL_READ_ONLY` | 尝试修改外部安装 | 说明面板仅发现该安装 |
| 429 `RATE_LIMITED` | 请求限流 | 遵循 Retry-After，不持续轰炸 |
| 500 `INTERNAL_ERROR` | 未预期服务端错误 | 展示 requestId；不显示栈、SQL、文件系统秘密或原始错误 |
| 503 `SERVICE_UNAVAILABLE` / `SERVER_DRAINING` | 本机服务暂不可用或正在排空 | 保留旧数据、标为过期；写请求继续遵守原幂等键，不盲目新建任务 |

任务运行期错误通过 `Task.error` 返回，例如 `DISK_SPACE_INSUFFICIENT`、`DOWNLOAD_FAILED`、`CHECKSUM_MISMATCH`、`EXTRACT_FAILED`、`POST_INSTALL_ACTION_FAILED`。查询一个失败任务仍然是 HTTP 200；不能把“任务失败”混为“读取任务 API 失败”。

## 10. 任务执行与运行时安全

### 10.1 任务状态机

```text
queued ───────────────→ canceled
   └→ running ────────→ succeeded
          ├───────────→ failed
          ├───────────→ canceled       （仅在安全阶段）
          └───────────→ interrupted    （进程/服务意外中断后核实）
```

`cancelRequestedAt` 表示收到请求，不代表已经取消。`canCancel` 由后端按阶段实时给出；提交或原子切换阶段不可中断。取消与成功发生竞争时，以后端最终状态为准。

终态不可在原任务上改回 running；“重试”会重新预检并创建新任务，记录 `retryOfTaskId` 到任务结果/关联元数据。用户离开页面或关闭浏览器不是任务取消条件。

### 10.2 安装阶段

| 阶段 | 行为 | 失败边界 |
| --- | --- | --- |
| `preflight` | 平台/权限/目录/磁盘/互斥/来源检查 | 不满足则不下载、不修改现有版本 |
| `download` | 写入受控临时目录，报告真实字节 | 支持取消；限制大小、超时和重定向 |
| `verify` | 与可信元数据中的校验值/签名策略核对 | 校验失败不能继续，也无“跳过校验” |
| `extract` | 安全解包到独立 staging 目录 | 拒绝目录穿越、危险链接和异常体积 |
| `validate` | 在受限身份下验证架构与真实版本 | 版本不匹配不登记为可用 |
| `commit` | 同一文件系统内原子提交目录，登记安装 | 不覆盖已有安装目录 |
| `set-default` | 仅用户选择时更新面板默认指针 | 独立核验，不影响已有应用绑定 |
| `finalize` | 再扫描实际安装与引用，写入结果 | 以磁盘与配置真实状态为准 |

下载进度仅针对下载阶段；其他阶段展示阶段名，除非有真实可计算的总工作量。禁止用“下载结束”直接当作“安装完成”。

若安装提交成功但默认值更新失败，任务为 failed，结果明确记录“安装保留成功；默认值未改变”；界面给出单独重试默认切换入口。失败不能删除已经验证成功且可能被后续使用的目录。

### 10.3 文件布局与所有权

以下为建议的部署布局；具体基础路径可在安装时确定，服务运行后由配置读取，不从浏览器传入：

```text
/opt/zx-panel/                       Go 主程序（内嵌前端）及独立 Go 辅助程序
/var/lib/zx-panel/
├─ panel.db                         应用、运行时、任务、设置与审计索引
├─ panel.lock                       当前数据目录的主程序排他锁
├─ runtimes/
│  ├─ node/<version>/<platform>/    面板管理的 Node.js 安装
│  └─ go/<version>/<platform>/      面板管理的 Go 工具链
├─ staging/<task-id>/                下载/解包暂存，与目标提交目录同文件系统
├─ cache/artifacts/                 已验证安装包缓存，受配额限制
└─ exports/                         已授权日志导出临时文件
/etc/zx-panel/                       服务配置与独立受限权限的秘密材料
/run/zx-panel-helper/control.sock    受限的本机辅助通信端点，不是 TCP 服务
/srv/zx-apps/                        批准的应用根目录，不由卸载运行时操作删除
```

数据目录、安装目录和应用目录必须由各自所需身份拥有，禁止整个树统一 `chmod 777`。已有外部安装仅记录其来源与路径，不移动、不删除。外部版本探测也不能以高权限执行任意 PATH 中的未知程序。

路径规范化与安全解包需要在打开文件时保持边界，不能只做字符串前缀判断。拒绝 `..`、绝对解包路径、逃逸的符号/硬链接和链接替换竞争；限制解包后总大小、文件数与执行权限。清理任务只清理由该任务创建且确认归属的暂存目录。

### 10.4 来源与兼容性

目录适配器负责版本排序、架构映射、维护状态和兼容性，不能做字符串字典序比较。Node 的 `x64` 与其他生态的 `amd64` 等通过明确映射处理；前端只显示后端的规范化结果。

下载 URL 由允许的提供方适配器生成，不接受前端任意 URL。HTTPS、允许的上游主机及重定向策略、可信校验元数据必须一起验证。校验和不自动等于可信来源；若元数据本身未通过信任策略，不将文件标为“可信已验证”。具体提供方的签名/摘要策略需在适配器测试中固定。

Go 安装按隔离的新目录管理，不把新归档覆盖解压进旧工具链目录；官方安装指引也强调避免覆盖旧树。[^s11] 此项目的多版本目录策略与系统安装位置独立。

平台能力矩阵由后端返回：原生 Linux x86_64 / arm64 是目标测试组合，但每个具体发行版、libc、运行时版本均需实际验证。Alpine/musl、非 systemd、受限容器不得因架构相同就自动标记“全支持”。

### 10.5 中断恢复与回滚

服务启动时扫描非终态任务及 staging/最终目录：已经完成提交的步骤按证据恢复；无法证明状态的任务标记 interrupted，并重新扫描资源。禁止在重启后盲目重放全部安装或删除操作。

应用回滚是将绑定切回仍然可用的旧安装/配置，并单独确认重启，不宣称可以自动回滚应用产生的数据变化。首发不自动删除旧版本、不做无人确认的“升级全部”。

## 11. 监控采集、指标口径与实时传输

### 11.1 指标定义

Linux `/proc` 是 CPU、内存等指标的基础来源之一；`MemAvailable` 与 `MemFree` 含义不同，不能直接拿空闲内存计算应用视角的使用率。[^s12] 以下公式是本项目统一的展示口径，必须写入测试。

| 指标 | 本项目口径 |
| --- | --- |
| 总 CPU | `100 × (Δtotal − Δidle − Δiowait) / Δtotal`；total 为 user+nice+system+idle+iowait+irq+softirq+steal；不再次叠加 guest/guest_nice |
| 各核 CPU | 对各逻辑核分别使用同一差分口径 |
| 进程 CPU | `100 × ΔprocessCpuSeconds / ΔmonotonicSeconds`，以单核为 100%，多线程可超过 100%；不要截断到 100 |
| 应用 CPU | 同样以单核为 100%，按受托管应用 cgroup 的 CPU 时间差分汇总 |
| 内存使用量 | `MemTotal − MemAvailable`；缓存信息单列，避免重复相加 |
| 内存使用率 | `usedBytes / totalBytes × 100`；没有 MemAvailable 时返回不可用/明确的降级算法，而非静默换口径 |
| 文件系统已用量 | `totalBytes − freeBytes`；与非特权用户可用量 availableBytes 分开 |
| 文件系统使用率 | `usedBytes / totalBytes × 100`；工具提示标明总容量口径，不承诺与其他保留块口径完全相同 |
| 网络与磁盘速率 | `ΔcounterBytes / 实际单调时间间隔`；不能假设采样线程永远恰好每 2 秒执行 |
| 系统运行时间 | 由后端系统单调运行时间读取；不靠浏览器当前时间减展示日期作为事实 |

首次样本不足、设备重置、计数器回退、CPU 热插拔、时间间隔异常时，该差分点为 `null` / warming-up，下一段重新建立基线。指标异常不强行钳制为“漂亮的正常值”；超过合理范围先标注不可用并记录采集错误。零值只表示真实测量为零。

主概览默认选根文件系统与主路由网卡，其他设备在监控页选择；虚拟接口/分区不能无条件相加产生双重计数。容量用 KiB/MiB/GiB，速率用 KiB/s、MiB/s；如提供十进制单位切换，整个视图统一切换。

### 11.2 采集与历史保留

| 数据 | 采集/刷新 | 首发保留与呈现 |
| --- | --- | --- |
| CPU、内存、网络、块设备速率 | 后端默认 2s | 原始点内存环形缓冲 15min |
| 文件系统容量 | 后端默认 15s | 指标快照携带该字段的实际采集时间/年龄，不伪装成每 2s 重测 |
| 主机静态信息 | 启动读取，60s 缓存 | 重新启动或变化后刷新 |
| 系统进程 | 页面有订阅时统一采集，5s | 不为每个浏览器重复扫描进程表 |
| 监控历史 | 10s 聚合写入本机存储 | 保留 24h，记录 avg/min/max/sampleCount；数据库总量受配额约束 |
| 任务元数据/审计 | 事件触发写入 | 默认保留 30 天，清理行为本身记录审计 |

历史查询默认最多 600 个点：15min 可返回 2s 原始点；1h 使用 10s 聚合；24h 使用 5min 聚合。聚合必须保留峰值信息，不能只平均后隐藏异常。采样字段的 freshness 单独判断；容量 15s 与 CPU 2s 不能套同一个超时阈值。

文件系统子对象的 `sampledAt` 已在类型中明确；新增非同频子指标也必须携带实际采集时间。验收以各字段自己的采样频率和时间为准，不使用发送快照的时间掩盖旧值。

保留策略改变时只承诺未来数据的保留，不能重新生成已经删除的历史。聚合数据库建议默认配额 128MiB，达到配额先清理最旧监控聚合，不删除正在运行的任务或关键配置；超限写入失败须可见。

### 11.3 主 SSE 事件

浏览器会话内一条主 SSE 承载指标与状态变化；日志页最多额外一条当前来源的日志流。SSE 使用 `text/event-stream`、事件 ID 与规范格式；浏览器可据事件 ID 续接，心跳避免静默连接长期占用。[^s08]

```text
id: epoch-demo:1024
event: metrics.sample
data: {"streamEpoch":"epoch-demo","payload":{"sampledAt":"2026-09-28T14:24:00Z","sequence":120,"bootId":"boot-demo","intervalMs":2000}}

id: epoch-demo:1025
event: task.updated
data: {"streamEpoch":"epoch-demo","payload":{"id":"task-demo-001","revision":2,"status":"running","stage":"download"}}

```

上面只展示事件封装与少量字段；真实 `payload` 必须分别为完整 `MetricSnapshot` / `Task`，不可用字段也应按契约返回。不要按这个缩略示例生成缺字段的生产接口。

| 事件 | 处理 |
| --- | --- |
| `metrics.sample` | 依据 streamEpoch 与 sequence 去重，更新最新样本与环形缓冲 |
| `task.updated` | 仅接受更高 revision，更新任务缓存 |
| `runtime.changed` | 使对应安装/摘要/引用 Query 失效 |
| `app.changed` | 使应用列表、详情及相关引用 Query 失效 |
| `capabilities.changed` | 重新读取能力，禁用已撤销动作 |
| `heartbeat` | 只更新连接活性，不伪装成新的采样数据 |
| `reset` | 丢弃旧续传边界，重新获取 bootstrap 与有效历史 |
| `auth.expired` | 关闭流、清理会话数据、进入登录流程 |

`streamEpoch` 在服务实例重建时变化；`bootId` 是系统启动标识，二者不是同一个字段。任务 revision 持久化；指标 sequence 在一个采集 epoch 内单调增加。浏览器不对不透明游标做字典序排序。

### 11.4 首屏、续传与回退

1. `GET /bootstrap` 先捕获事件游标，再收集资源快照；服务端至少保留游标之后的事件，以便快照获取期间的变更可以重放。快照对应的资源 revision/sequence 与事件共同用于去重。
2. 建立 `/events?after=<streamCursor>`。浏览器自动重连使用 Last-Event-ID；手动新建连接时显式传入已保存游标。游标不是身份凭据，服务端仍逐次验证会话权限。
3. 服务端默认保留最多 10 分钟或 10000 条主事件，以先达到者为准。游标过期或 epoch 改变时发送 reset，不假装已经完整续接。
4. 每 15s 心跳。CPU 等 2s 指标超过 6s 未收到新样本显示“数据延迟”，超过 15s 显示“采集不可用”；文件系统按其 15s 采样周期分别使用 45s / 90s 阈值。网络连接是否仍活跃与采集是否正常独立呈现。
5. 连续断流启用 5s `GET /metrics/latest` 与活动任务轮询；SSE 恢复后关闭后备轮询。本项目采用单个手动重连控制器：`onerror` 先关闭原 EventSource，再按 1/2/4/8/15s 上限退避并增加抖动，用已保存游标新建连接；不让原生自动重连与手动循环并行。无法直接识别流错误状态时，读取最小会话接口判定是否失去认证，未认证立即停止重连。
6. 页面隐藏时降低渲染频率，必要时关闭日志流；回到前台用游标续接与快照补齐。任何降频不改变后端任务生命周期。

反向代理关闭 SSE 响应缓冲，及时 flush，配置适当空闲超时；不要只在无代理开发环境验证。会话在流连接期间过期时必须主动终止，不能因为连接已经建立就永久授权。

### 11.5 前端内存与真实性

单图不超过 600 个渲染点；主流刷新按模块局部更新。日志前端环形缓冲默认最多 5000 行，同时设总字节限制 5MiB；单条默认最多 16KiB，截断明确标记。高吞吐时批量推送并报告丢弃计数，不能为了看起来完整而无限吃内存。

不得在生产代码中用 `Math.random()` 生成监控数据。演示模式必须有全局“演示数据”标识，且与真实 API 模式二选一，不允许部分卡片用真实数据、部分卡片用静默假数据。

## 12. 本机服务架构与安全要求

### 12.1 服务边界

```text
浏览器 React SPA
       │ 同源 HTTPS / 会话 / CSRF
       ▼
zx-panel Go + Gin HTTP API（非特权服务账号，内嵌 React SPA）
       ├─ Gin middleware / DTO / 身份与权限
       ├─ Go 本机信息/监控采集器
       ├─ 运行时目录适配器与受控下载
       ├─ Go 任务执行器 → database/sql → 本机 SQLite
       ├─ 本机应用/日志适配器
       └─ 本地 Unix Socket → 独立 Go 最小权限辅助服务
                              └─ 仅允许的安装目录操作与托管 unit 操作
```

辅助服务不监听公网，不接收任意 shell 字符串。请求是经过校验的结构化动作和本机资源 ID；辅助端再次校验调用者身份、资源归属、路径与动作允许列表。权限不足时返回能力受限，不要求用户把整个 Web 服务改为 root。

应用进程使用批准的非 root 账号；运行时目录对应用只读。创建服务配置时必须正确编码路径与参数，不允许通过换行、模板字段或自由文本注入额外 service 指令。应用管理只操作面板登记并拥有的 unit，不控制任意系统服务。

### 12.2 身份、访问与会话

默认仅绑定回环地址，实际浏览器生产入口使用配置明确的 HTTPS 同源入口。需要由其他设备访问时，部署者显式配置入口与可信代理；这不增加远程服务器管理功能。

首次启动通过本机 CLI/受限终端生成高熵、一次性、短期有效的初始化凭据；没有默认公共密码。凭据不放在 URL，不写访问日志；`/setup` 完成后原子关闭初始化能力。初始化不是任意访问者都能抢注管理员。

所有主机信息、日志、任务、下载与 SSE 都需要认证。会话采用 HttpOnly、Secure、SameSite Cookie，登录后轮换 ID；建议空闲 30 分钟、绝对 12 小时失效。开发环境的回环 HTTP 必须使用独立配置，不能把不安全 Cookie 配置带入生产。

写请求同时检查 CSRF Token 与允许的 Origin/Host，拒绝宽泛 CORS。SameSite 是补充而非唯一 CSRF 防线，策略参考 OWASP CSRF 防护指南。[^s13] 可信代理名单必须固定，不能信任任意来源的转发头。只管理本机也必须防止跨站请求和 DNS rebinding。

首发可以只有一个管理员账号，不建设复杂 RBAC 页面；但每项动作与每个资源仍必须在后端校验权限。读取权限下降、会话退出或失效时，主动停止既有流并清除敏感缓存。

### 12.3 执行与秘密保护

执行使用明确的可执行文件与参数数组，不使用 `sh -c` 拼接用户输入。高权限安装/校验进程使用清洁环境；不能继承用户提供的 `PATH`、动态加载器变量或影响工具执行的参数。任务配置不能把额外任意命令作为“安装后脚本”。

用户的应用代码按其应用账号权限运行；面板不是任意不可信代码的安全沙箱，不应宣称提供此能力。若后续需要多租户隔离，应作为独立架构需求设计。

秘密环境变量、密码和会话令牌不得出现在访问日志、错误详情、任务事件、审计正文、URL、浏览器 localStorage 或截图样例中。密码只保存专用密码哈希，不可逆明文；应用秘密在服务端加密存储，密钥与数据库分离且权限受限。应用所需的秘密文件仅对目标服务身份可读，并有清理机制。

Vite 的 `VITE_*` 变量会暴露到客户端构建产物，因此只能放公开的前端配置，不能存服务端秘密。[^s16]

### 12.4 审计、配额与故障处理

所有受理或拒绝的危险操作记录：操作人、时间、动作、资源 ID、脱敏参数摘要、任务 ID、结果与请求 ID。审计不记录秘密原值。配置/任务/审计数据库迁移需要备份与版本记录；默认自动清理只能作用于到期数据，不删除配置。

后端限制请求体大小、日志导出量、下载体积、解包文件数、任务数量、单会话流连接数和执行超时。日志默认导出上限 50MiB；更大请求要求缩小范围，不无限读取磁盘。安装所需空间应包含归档、展开目录、保留旧版本与安全余量，以预检当时实际可用空间计算。

对运行目录、暂存、缓存、导出分别设置配额并提供可读错误。磁盘满时优先保全已安装目录与应用配置，不能删除“看起来很旧”的运行时作为隐式补救。

### 12.5 后端技术栈：Go + Gin（确定约束）

后端语言固定为 **Go（Golang）**，HTTP 框架固定为 **Gin**，模块依赖为 `github.com/gin-gonic/gin`。这不是候选方案；不得替换为 Node.js、Python 或其他 Web 框架。Gin 负责 HTTP 路由与传输适配，业务规则、任务执行和本机操作不得耦合到 Gin Context。Gin 的路由分组、中间件和 Context API 以官方包文档为准。[^s17]

| 领域 | 实施基线 | 约束 |
| --- | --- | --- |
| 语言与模块 | Go + Go Modules | 提交 `go.mod`、`go.sum`；CI 固定 Go 工具链与依赖版本 |
| HTTP 服务 | Gin + 标准库 `net/http.Server` | 使用 `gin.New()` 显式装配中间件；生产不直接照搬 `r.Run()` 的最小示例 |
| JSON / DTO | 明确的 Go struct、`encoding/json`、统一边界校验 | 不把数据库实体直接序列化；写入契约不使用无约束 `map[string]any` |
| 本机存储 | `database/sql` + SQLite；基线驱动 `modernc.org/sqlite` | 显式 SQL 与版本化迁移；首发不额外引入 ORM、Redis 或外部数据库 |
| 日志 | 标准库 `log/slog`，结构化 JSON 输出 | 请求、任务、审计分别记录；字段脱敏；不输出请求体或 Cookie |
| 配置 | Go struct + 本机 JSON 文件 + 受允许环境变量覆盖 | 启动时严格校验；配置不从任意 HTTP 请求读取 |
| 任务 | Go worker + SQLite 持久任务 + 本机资源锁 | channel 仅用于唤醒，不作为任务的唯一存储 |
| 监控 | Go 定时采集器 + Linux 适配层 | `/proc`、`/sys` 与本机系统接口；不逐次执行 `top` / `free` 并解析终端文本 |
| 实时数据 | Gin SSE Handler + 有界 EventHub | 延续第 11 章协议；不为监控额外建设 WebSocket 服务 |
| 应用管理 | Go 应用服务 + 本机 systemd 适配器 | 受限辅助服务只通过 Unix Socket 接收结构化请求 |
| 前端发布 | Go `embed` 内嵌 Vite 构建产物 | 面板主程序同时提供 API 与 SPA；无独立 Node.js 前端生产进程 |
| 测试 | `testing`、`httptest`、集成测试、race 检测、漏洞扫描 | 真实 Linux / systemd 测试与无特权单元测试分开运行 |

`modernc.org/sqlite` 文档说明其为无需 CGo 的 SQLite 驱动；这是本项目选择它作为默认驱动的部署考虑，不等于整套应用已经通过无 CGo 构建或所有平台测试。目标平台仍以发布矩阵验证。[^s22]

**版本管理：**初始化时核对 Gin 与 SQLite 驱动各自要求的 Go 版本，选取兼容且处于维护期的组合，记录在 `go.mod`、CI 和构建说明中。生产构建不得临时执行不带固定版本的依赖升级。版本变更必须经过构建、接口契约、数据库与安全测试。

**两个 Go 概念必须分开：**构建 zx-panel 自身的 Go 工具链属于开发与发布环境；运行时页面安装的 Go 属于用户管理对象。安装或切换后者不得修改前者、触发面板源码编译或暗中升级面板。发布验证要求：在未安装 Node.js 与 Go CLI 的目标机器上，面板主程序仍可启动并提供前端；实际应用或构建任务的依赖另行判断。

### 12.6 Go 工程分层与依赖方向

```text
HTTP 请求
   ↓
httpapi：Gin 路由 / middleware / DTO / 错误映射 / SSE
   ↓
业务服务：auth / operations / runtimes / applications / metrics / logs
   ↓
业务接口：Repository / Collector / RuntimeProvider / Supervisor / PrivilegedClient
   ↓
适配实现：SQLite / Linux / 官方版本源 / systemd / 本机 Unix Socket
```

| 层级 | 可以负责 | 不可以负责 |
| --- | --- | --- |
| `httpapi/handler` | 读取已认证主体、校验 DTO、调用服务、输出契约 | 下载归档、执行安装、拼 SQL、直接控制 systemd |
| 业务服务 | 授权、状态转换、预检、引用检查、事务边界与任务提交 | 引用 `*gin.Context`、拼装 HTTP 状态码 |
| `store/sqlite` | 参数化查询、事务、约束、分页、持久化映射 | 绕过业务授权；在 SQL 事务内执行网络下载 |
| 平台 / 提供方适配器 | 操作明确的本机资源、调用允许的上游源 | 接受任意远程主机、用户输入下载 URL 或 shell 字符串 |
| `bootstrap` | 配置、依赖装配、生命周期、关闭顺序 | 承载页面业务或成为无边界的全局 service locator |

依赖通过构造函数显式注入；接口定义在使用方，只为需要替换或测试的边界建立接口，不为每个 struct 增加一层空接口。除 `httpapi` 与启动装配外，业务包不得导入 Gin。

业务方法的第一个参数为 `context.Context`，身份和动作输入使用明确类型。同步读取使用请求 Context；已受理任务使用任务执行器管理的 Context。不要用 `context.Background()` 随意创建永不退出的子流程，也不要将整个 Gin Context 保存到任务结构体。Gin 提供 `Context.Copy()` 供特定跨协程场景使用，但本项目持久任务仍只接收可序列化业务输入，不传 Context 副本。[^s17]

### 12.7 Gin 路由、中间件与输入边界

**路由装配。**API 仍使用第 9 章的 `/api/v1`，不改变前端已经定义的资源路径；`/api/v1/runtimes` 是用户运行时资源，不代表 Go 内部的 `runtime` 包。使用 Route Group 区分以下边界，不把整组 API 误配置为匿名访问：

| 分组 | 接口 | 保护方式 |
| --- | --- | --- |
| 最小匿名读取 | `/auth/session`、`/setup/status` | Host 检查、限流、最小返回值、不泄露主机信息 |
| 认证入口 | `/auth/setup`、`/auth/login` | Host / Origin、初始化或登录限流、登录前 CSRF 保护 |
| 已认证读取 | 系统、监控、运行时、应用、进程、任务、日志、设置 | 会话、资源读取权限、响应配额 |
| 已认证写入 | 预检、提交、取消、导出、设置、密码与注销 | 会话、CSRF、Origin、动作授权、必要的幂等检查 |
| 长连接 / 下载 | `/events`、`/logs/stream`、导出下载 | 逐次授权、单独配额与超时策略，不复用短请求总时限 |

匿名会话接口可创建短期预登录会话并返回其 CSRF Token；登录与初始化提交时同时校验该 Token 和 Origin。成功登录后轮换会话及 CSRF Token，不把“尚未登录”作为跳过跨站防护的理由。具体 Cookie 与登录前会话生命周期需写入契约测试。

**中间件装配顺序：**传输层限额 → Request ID → 结构化访问日志 → 安全 Recovery → 安全响应头 / Host 校验 → 路由级限流 → 会话 / CSRF / 动作授权 → Handler。幂等的业务事务在服务层执行；不能仅在 HTTP 中间件里缓存一份响应冒充持久幂等。

| 关注点 | 必须实现的行为 |
| --- | --- |
| 请求标识 | 生成服务端 requestId；只在可信入口规则内接收外部 ID，限制长度和字符；响应头与 `meta.requestId` 一致 |
| Recovery | 记录脱敏错误并返回统一 `INTERNAL_ERROR`；不向客户端发送栈；不使用会完整转储敏感请求头的日志处理方式 |
| 已开始响应 | SSE 或下载已经写出响应头时，不再追加 JSON 错误体；记录错误并结束流 |
| 可信代理 | 无代理时显式 `SetTrustedProxies(nil)`；有代理时只允许部署配置中的具体地址/CIDR，禁止全信任 |
| Host / Origin | 与允许的入口精确匹配；可信代理 IP 配置不自动等同于 Host、Origin 或 TLS 信任策略 |
| 路由回退 | 未知 `/api` 路径返回 JSON 404；错误方法返回 JSON 405 并带正确 `Allow`；不得落到 SPA HTML |
| 访问日志 | 使用路由模板、状态、耗时、requestId；避免记录完整查询字符串、环境变量、密码、初始化凭据 |
| 调试接口 | 生产不向普通 API 入口注册 `pprof`、调试变量或交互式 Swagger；必要诊断只通过显式启用的本机受限入口 |

Gin 的可信代理配置会影响客户端 IP 的推导；实现必须显式设置，而不是沿用框架默认信任行为。[^s17]

**JSON 写入统一经过严格解码器。**可在 Gin Handler 中调用项目的解码工具，但必须满足下表；不得将一次默认 `ShouldBindJSON` 调用视为全部安全校验。

| 检查 | 实施要求 |
| --- | --- |
| 媒体类型 | 首发写接口只接受 `application/json`（允许正确的 charset 参数）；不自动切换到表单/XML 绑定 |
| 大小 | 默认 JSON 请求体不超过 1MiB；通过 `http.MaxBytesReader` 等读取层限制实现，不能只看 Content-Length |
| 结构 | 恰好一个 JSON 对象；拒绝空正文、顶层 `null`、数组、拼接 JSON 与尾随非空白数据 |
| 字段 | `DisallowUnknownFields` + 对应动作的精确 DTO；未知字段、必填字段缺失和非法枚举都拒绝 |
| 重复与别名 | 对安全敏感写接口拒绝重复对象键；字段名严格按契约大小写匹配，不接受大小写别名绕过校验 |
| 联合类型 | `OperationSpec` 先识别允许的 action，再对完整对象按该 action 的 DTO 严格校验；嵌套 `AppExecution` 同理 |
| 数值 | 指标输入、分页、revision 与数量校验范围；不用 `float64` 暂存任意 64 位整数 |
| 业务 | 版本引用、资源归属、真实路径、权限与平台能力继续在服务层校验；通过 DTO 不等于操作获准 |

标准库 `DisallowUnknownFields` 只处理结构体目标的未知字段，不负责拒绝重复键或落实本项目的动作联合类型；这两项需要显式补充，不能作出错误安全假设。[^s19]

HTTP 错误遵守第 9.5 节：结构损坏为 400；大小超限为 413；媒体类型不支持为 415；结构可解析但字段不合法为 422。对 Gin `Bind*` 自动写入错误状态的行为不做依赖，错误只由统一 response 层提交。

### 12.8 Go DTO 与 JSON 一致性

Go 响应字段显式声明 camelCase `json` 标签；不能直接将 `sql.NullString` 等数据库类型编码为 API。契约为可空值的字段保持显式 `null`，不是用零值、空字符串或 `omitempty` 偷换语义。要求存在的列表即使为空也返回 `[]`，不是 `null`。

以下为 DTO 映射片段，不是完整接口实现：

```go
package dto

// MetricValue 与前端的 value / quality / reasonCode 保持一致。
type MetricValue struct {
	Value      *float64 `json:"value"`
	Quality    string   `json:"quality"`
	ReasonCode *string  `json:"reasonCode"`
}

// 用指针区分必填布尔值缺失与显式传入 false；校验后映射为业务 bool。
type RuntimeInstallRequest struct {
	Action      string `json:"action"`
	ReleaseID   string `json:"releaseId"`
	MakeDefault *bool  `json:"makeDefault"`
}

type ApiMeta struct {
	RequestID  string `json:"requestId"`
	ServerTime string `json:"serverTime"`
}

type SuccessEnvelope[T any] struct {
	OK   bool    `json:"ok"`
	Data T       `json:"data"`
	Meta ApiMeta `json:"meta"`
}
```

`SuccessEnvelope.OK` 只能由成功响应工厂设为 `true`；失败使用独立错误结构，不允许同时出现成功 `data` 与错误 `error`。`quality`、`action` 等在完整实现中使用类型化常量并通过白名单校验。`MakeDefault == nil` 是非法输入；`false` 是合法值，不能用“布尔值必须为真”式的 required 校验误拒绝。

时间统一 `UTC().Format(time.RFC3339Nano)`；输出小数百分比前校验有限数值，不能输出 NaN/Infinity。网络累计字节等大整数转换为十进制字符串；数量为 0 与数据不可用 `null` 分开。OpenAPI、Go DTO、前端 Schema 与 Mock 必须通过同一组正反例校验。

### 12.9 任务执行器、Context 与 SQLite 事务

一次 `POST /operations` 的同步请求只负责授权、确认和**持久受理**，不在 Handler 里安装软件。流程固定为：

```text
校验身份 / CSRF / 请求
  → 事务内查同一操作人的幂等记录
  → 有既有结果：核对请求指纹并返回原任务
  → 无既有结果：核对计划、权限、引用、revision 与有效期
  → 原子写入任务、任务输入、计划消费、幂等结果与受理审计
  → 提交事务
  → 通知 worker（通知丢失可由持久队列扫描恢复）
  → 返回 HTTP 202 + Task
```

数据库事务中的检查只访问持久状态。磁盘空间、下载来源、文件路径和平台等外部预检在事务外完成，并在持有资源锁的实际执行阶段再次核对；不得在 SQLite 写事务中等待网络、长时间扫描或执行 systemd 动作。

| 生命周期 / 并发点 | 实施要求 |
| --- | --- |
| 已受理与浏览器断开 | 提交事务之后客户端断开不撤销任务；Worker Context 不派生自 `c.Request.Context()` |
| 无响应但提交结果未知 | 客户端用原幂等键重试，后端查询已提交记录；不能因为写响应失败而删除任务 |
| Worker 认领 | 条件更新 `queued → running`，核对影响行数；持有资源锁后重新校验；禁止普通 SELECT 后无条件 UPDATE |
| 队列与配额 | 安装重任务并发默认 1；待处理任务总数默认最多 100，达到上限返回可读限流错误；唤醒 channel 有界 |
| Context | 普通请求、服务生命周期、任务截止时间、用户取消、服务排空分别建模；只有安全阶段响应取消 |
| 原子提交区间 | 不因浏览器取消或普通服务信号直接打断；记录阶段证据后完成最小提交/一致性恢复 |
| Panic | 每个 worker 边界独立处理并持久记录；无法判明外部副作用时为 interrupted，不能伪称安全失败或回滚完成 |
| 恢复 | 服务重启后识别未认领 queued 与有执行痕迹的任务；按第 10.5 节核实，禁止盲目重放 |
| 事件发布 | 任务 revision 和相应状态事件在事务内持久化，提交后广播；可用本机 outbox 补发，不引入外部消息系统 |

安装/默认值/应用操作的逻辑锁遵守第 9.4 节。首发同一数据目录只允许一个面板主进程，启动时取得进程级排他锁；此锁不取代数据库唯一约束、任务认领和辅助服务自己的资源检查。

**SQLite 连接策略。**设置 WAL；关键配置与任务写入基线采用 `synchronous=FULL`；启用外键；设置有界 `busy_timeout`（初始 5s）；写连接池最大 1，独立读连接池初始最多 4。每条连接都必须获得适用的连接级 PRAGMA，不能只对某次借出的连接执行一次。驱动的连接初始化/DSN 行为按锁定版本验证。[^s22]

WAL 支持读写并发，但不意味着允许多个写事务同时提交；SQLite 文档明确其单写者约束。数据库及 WAL/SHM 文件必须置于本机可靠文件系统，不以网络共享目录作为首发部署方案。[^s21]

参数化 SQL 与 `sql.Tx` 统一封装到 repository；事务内部不得混用 `db.Exec` 等事务外调用。提交错误必须返回并检查，不能提前返回“已成功”。Go 官方事务指南可作为具体 API 用法的基线。[^s24]

| 表 / 数据域 | 最低要求 |
| --- | --- |
| `users`、`sessions` | 密码哈希；会话仅保存令牌摘要、过期与撤销信息，不持久化原始 Cookie |
| `runtime_installations`、`runtime_defaults` | 安装归属、状态、revision、默认引用；禁止由删除触发隐式删除应用 |
| `managed_apps`、`app_secrets` | 明确版本绑定；配置 revision；秘密加密且只读接口不回传 |
| `operation_plans` | 操作人、过期、摘要、单次消费与执行任务关联；敏感短期输入受控保存 |
| `tasks`、`task_inputs`、`task_logs` | 状态、阶段、revision、取消标记、持久执行输入与脱敏日志；计划关联唯一 |
| `idempotency_records` | `UNIQUE(actor_id, idempotency_key)`；绑定动作、规范化请求摘要与原任务 ID |
| `event_outbox` | 状态事件可补发；按资源 ID + revision 去重，不要求与监控样本共用数据库序列 |
| `metrics_aggregates` | 分辨率、时间范围、采样数量、缺口及配额；不逐点写入所有原始样本 |
| `settings`、`audit_events` | 受控设置、revision、审计留存与脱敏 |
| `schema_migrations` | 已执行版本与校验值；检测到未知/失败迁移时停止启用写能力 |

幂等摘要从经规范化的结构化输入生成，不受 JSON 空白和键顺序影响；摘要不替代原始输入的受控持久化。保留期、计划有效期与任务输入清理由第 9–10 章共同约束。

迁移在受控 CLI/部署步骤完成，生产服务启动遇到未迁移 schema 时明确退出，不在处理请求时偷偷迁移。迁移前备份；备份使用经过验证的一致性快照方法，或停服并正确处理 WAL 后复制，不在数据库运行时只复制 `panel.db`。加密密钥需要独立安全备份；只恢复数据库而丢失密钥不得宣称可以恢复应用秘密。

### 12.10 Gin SSE、HTTP 超时与背压

复用一个 HTTP 服务承载 JSON、SSE 与受控下载，但三类响应使用不同的时限。以下数值是初始工程配置，需做慢连接与真实代理测试，不是框架默认值：

| 项目 | 基线 |
| --- | --- |
| `ReadHeaderTimeout` | 5s |
| `ReadTimeout` | 15s；首发无大文件上传 |
| `IdleTimeout` | 60s；这是等待下一请求的超时，不是 SSE 的总存活时间 |
| `MaxHeaderBytes` | 32KiB |
| 普通业务 Context | 默认 10s；密码哈希等已知开销通过专项配置与限流处理 |
| 普通 JSON 写截止时间 | 每请求 15s |
| SSE 写截止时间 | 每次事件/心跳写入前更新为当前时间 + 10s |
| 受控导出下载 | 默认总时限 120s，并校验身份、取消与 50MiB 文件上限 |
| `http.Server.WriteTimeout` | 同端口 SSE 模式设为 0，由下面的分类写时限补足；不得只设为 0 后省略所有写保护 |

Go `net/http` 提供服务端超时和 `ResponseController`；其普通总响应超时不能直接当作 SSE 空闲控制。`http.TimeoutHandler` 不支持 Flusher，不能直接包住需要实时刷新的 SSE Handler。[^s18]

在 Gin 外层的标准 `http.Handler` 传输适配器取得原始 `http.ResponseWriter` 并创建 `ResponseController`，向 HTTP 层传递受控写入能力；显式检测 `SetWriteDeadline` / Flush 支持。自定义 writer 包装必须保持所需接口或 `Unwrap`，不假定每层中间件天然透明。初始化失败或不支持必要写保护时返回明确错误，不静默降级为无限阻塞。[^s18]

**SSE Handler 规则：**鉴权与参数检查在发送流响应头前完成；发送 `Content-Type: text/event-stream`、`Cache-Control: no-store`，需要的代理环境带 `X-Accel-Buffering: no`。每个流只有一个 writer 协程，串行写入 frame 并检查写入/flush 结果；订阅结束时注销、停止 ticker 并释放连接配额。

EventHub 主流连接队列初始上限 256 条且最多 1MiB，任一达到即将该慢订阅者断开，让客户端重连补齐；仍可安全写入时先发 `reset`。不阻塞全局采集器或任务提交，不静默丢掉任务终态后继续声称完整。事件主环形缓冲继续受第 11 章时间/数量上限约束，并增加总内存上限（初始 16MiB）；超出可重放窗口必须 reset。

日志流按第 11.5 节做批处理、截断与丢弃计数；不和主流共用无限队列。原始日志通过来源适配器读取，不允许借助 `c.File()` 暴露任意路径。

已建立流仍订阅会话撤销事件，并在心跳前核对时效；会话退出、改密、权限撤销、浏览器断开、服务排空都必须关闭对应流。被动 SSE 心跳不得永久续延管理员空闲会话。

### 12.11 本机适配器与权限辅助服务的 Go 落地

监控采集器按固定周期对本机采集一次，发布不可变快照；API 与多个浏览器读取同一快照，不为每个请求启动独立采样协程。首次差分、计数回绕、进程消失、权限错误和采样超时均转换为第 8 / 11 章定义的数据质量状态。

Linux 相关代码放在独立适配层；需要平台限定的文件使用 `_linux.go` / build tag。没有适配的操作系统返回不支持，不通过解析陌生平台命令输出伪装已支持。测试可注入临时 `/proc` fixture、时钟、平台探测与文件系统接口。

Node.js / Go 提供方只实现版本目录、兼容性映射、下载元数据和安装结果验证。下载复用带超时及重定向限制的 `http.Client`，逐次核验允许来源；不继承应用秘密，也不默认接受任意系统代理配置。安装流程沿用第 10 章，不因为后端使用 Go 而省略摘要验证或安全解包。

应用监督适配器优先通过本机 systemd 接口管理面板拥有的 unit；需要高权限的动作交给独立 Go 辅助进程。辅助进程不运行 Gin、不监听 TCP，只在受控 Unix Socket 上接收协议版本、请求 ID、动作、资源 ID 与有界的结构化参数；通过 OS 对端身份核对调用者，重做参数、路径与 unit 归属验证。

确需启动外部程序时使用固定可执行文件与参数数组；普通受控子进程可使用 `exec.CommandContext`，但必须配置清洁环境、工作目录、输出大小和退出等待。标准库 `os/exec` 不自动通过 shell 解释命令；不得为了方便重新包装成 `sh -c`。[^s23]

`CommandContext` 不等于完整进程树治理：托管应用由 systemd 管理其生命周期与子进程；安装器产生的临时子进程要有受控进程组/退出策略。不可取消提交阶段不得直接绑定一个会随 HTTP 请求取消的 Context。CLI 输出先脱敏和截断，再进入任务日志。

### 12.12 服务启动、排空与故障恢复

启动顺序固定为：读取并校验配置 → 校验目录权限与取得数据目录锁 → 打开数据库并核对迁移 → 探测平台/辅助服务能力 → 核实未终结任务 → 启动采集器、EventHub 和 worker → 监听 HTTP。依赖失败时记录可读原因并返回非零退出码；辅助服务不可用时可按能力模型降级只读，不能宣称全部管理功能可用。

部署侧存活检查使用本机 CLI 或仅返回最小状态的受限健康入口；不得为健康检查暴露完整 `/system/info`。普通启动、版本信息和辅助服务不可用情况不输出初始化凭据或秘密。

收到 SIGTERM / SIGINT 后先设置 draining，停止接受新的有副作用任务并返回 `SERVER_DRAINING`；停止 worker 认领，关闭 SSE/日志订阅，再调用 `http.Server.Shutdown` 等待普通请求退出。已在途的任务受理按事务结果定案：要么回滚、要么完整落库留待核实，不能产生无执行记录的“半受理”。

正在执行的任务在安全阶段记录中断信息并退出；处于最小原子提交区间时给予独立、有限的完成窗口。HTTP 排空初始 15s，任务安全退出初始最多 45s；`systemd TimeoutStopSec` 应留出额外余量，例如不低于 75s。超过窗口被终止的任务下次按磁盘证据恢复，不能由关闭函数擅自标记成功。

只有 worker 和持久化事件处理停止后才关闭数据库；最后释放目录锁。主程序必须等待关闭流程完成，不能让 `main` 提前退出。`Server.Shutdown` 只管理 HTTP 服务的关闭，不会替业务代码管理任务 worker；SSE 的结束与任务的一致性退出需要项目自行实现。[^s18]

## 13. 项目目录、Mock 与工程交付

### 13.1 项目目录与 Go 模块布局

```text
zx-panel/
├─ docs/
│  ├─ implementation.md
│  └─ api/openapi.yaml
├─ web/
│  ├─ src/
│  │  ├─ app/                  路由、Providers、应用壳层
│  │  ├─ components/
│  │  │  ├─ ui/               shadcn/ui 源码
│  │  │  └─ shared/           指标卡、状态、确认框、空态
│  │  ├─ features/
│  │  │  ├─ auth/
│  │  │  ├─ overview/
│  │  │  ├─ runtimes/
│  │  │  ├─ apps/
│  │  │  ├─ monitoring/
│  │  │  ├─ logs/
│  │  │  ├─ tasks/
│  │  │  └─ settings/
│  │  ├─ lib/
│  │  │  ├─ api/              统一客户端、Schema、错误映射
│  │  │  ├─ events/           SSE、游标、去重、回退
│  │  │  ├─ format/           容量、时间、百分比
│  │  │  └─ query/            Query keys 与配置
│  │  ├─ styles/              主题、基础布局、动效
│  │  ├─ mocks/               固定 fixtures、响应处理、场景
│  │  └─ test/
│  ├─ components.json
│  ├─ package.json
│  └─ vite.config.ts
├─ server/                    独立 Go module；HTTP 框架固定 Gin
│  ├─ cmd/
│  │  ├─ zx-panel/main.go      主程序 / CLI 入口
│  │  └─ zx-panel-helper/main.go  最小权限辅助进程入口
│  ├─ internal/
│  │  ├─ bootstrap/           依赖装配、启动、排空与关闭
│  │  ├─ config/              配置解析、校验与受允许覆盖
│  │  ├─ httpapi/
│  │  │  ├─ router.go         Gin 路由与分组
│  │  │  ├─ handler/          薄 HTTP Handler
│  │  │  ├─ middleware/       身份、CSRF、限流、日志与 Recovery
│  │  │  ├─ dto/              请求/响应结构、字段映射与校验
│  │  │  ├─ respond/          统一响应与错误码
│  │  │  └─ sse/              事件流、游标、时限与连接释放
│  │  ├─ auth/                管理员、会话、初始化、密码
│  │  ├─ system/              本机信息与能力模型
│  │  ├─ metrics/             采集调度、快照、聚合与历史
│  │  ├─ runtimes/            版本目录、安装与引用规则
│  │  │  └─ providers/        node / go 目录与制品适配器
│  │  ├─ applications/        托管应用与版本绑定
│  │  ├─ operations/          预检、确认、幂等与事务受理
│  │  ├─ tasks/               持久任务、worker、锁、恢复
│  │  ├─ events/              有界 EventHub、重放与本机 outbox
│  │  ├─ logs/                日志来源、过滤、导出、限额
│  │  ├─ settings/            受控设置与 revision
│  │  ├─ audit/               脱敏操作审计
│  │  ├─ store/sqlite/        database/sql repository 与连接配置
│  │  ├─ platform/linux/      procfs、文件、进程、systemd 适配
│  │  ├─ privileged/          Unix Socket 客户端/服务端与动作白名单
│  │  └─ webui/
│  │     ├─ embed.go          正式构建的前端资源内嵌
│  │     └─ dist/             从 web/dist 同步的构建产物
│  ├─ migrations/            有序 SQL 迁移与校验记录
│  ├─ test/integration/       HTTP / SQLite / Linux 集成测试
│  ├─ go.mod
│  └─ go.sum
├─ configs/                   开发/生产示例配置，无真实秘密
├─ deploy/systemd/            主程序与辅助服务部署单元
├─ scripts/                   前端资源同步、发布与验收脚本
├─ Makefile
└─ README.md
```

后端语言与框架已确定为 Go + Gin。`server/` 是单一 Go module，两个 `cmd` 入口共享受控内部包；不将采集器和任务执行器拆成网络微服务。包可随实际复杂度合并，但必须保留 HTTP、业务、存储、本机适配与权限边界。`webui/dist` 为构建产物，不能手工修改。

HTTP 契约以最终提交的 OpenAPI 为联调权威；生成客户端/边界 Schema 或执行等价的契约一致性测试，避免 Go DTO、前端和 Mock 各自维护不一致字段。生成器及配置须锁版本，生成后不得绕过严格输入与鉴权规则。

### 13.2 数据模式与固定样例

前端通过 `VITE_DATA_MODE=mock|api` 明确选择；发布到真实服务器的构建要求 `api`，错误模式应使发布校验失败。Mock 可以通过 Mock Service Worker 或等效请求适配器实现，不能散落在 JSX 中。Mock 必须遵守与真实 API 相同的 Schema、延迟、错误和任务状态机。

建议固定正常场景：

| 项目 | 示例值 | 说明 |
| --- | --- | --- |
| hostname | `zx-dev-01` | 纯测试名称 |
| 操作系统 | `Linux（测试环境）` | 不冒充当前实际服务器 |
| CPU | 8 逻辑核，18.4% | 趋势为固定数组 |
| 内存 | 总量 16GiB，已用 6.8GiB，42.5% | 容量与百分比一致 |
| 根分区 | 总量 200GiB，已用 72GiB，36.0% | 明确挂载点 `/` |
| 网络 | 下行 1.2MiB/s，上行 128KiB/s | 下行/上行单位各自显示 |
| 运行时 | Node.js 与 Go 各两条面板管理安装、另有一条外部发现安装 | 版本仅作测试，不标“当前最新版” |
| 应用 | 一条运行中、一条已停止、一条失败 | CPU 与内存来自匹配的测试状态 |
| 任务 | 一个下载中、一个校验失败、一个已完成 | 点击进入对应日志与结果 |

必须另有独立场景：空服务器、无网络目录、系统不支持、权限不足、外部安装、版本被引用、磁盘不足、校验失败、任务中断、数据过期、日志爆量、超长路径、会话过期、历史不足。

使用固定时间与固定数据生成可复现截图；不要每次渲染重新生成随机值。演示场景可推进虚拟时钟，但相同场景/种子必须有相同结果。

### 13.3 工程脚本与发布要求

前端必须提供 `dev`、`build`、`typecheck`、`lint`、`test`、`test:e2e` 脚本；Go 后端必须提供格式、`go vet`、单元/集成测试、race、构建与漏洞检查入口，详见第 13.5 节。禁止只有 `dev` 能打开、正式 build 失败的交付。

构建产物不能包含演示密码、访问令牌、未脱敏日志、整个测试数据集或未使用的大图资源。初始路由只加载必要代码；监控图表、复杂日志视图按需分包。静态资源自托管，不让面板正常使用依赖外部字体/图标 CDN。

SPA 路由刷新需正确回退到入口 HTML，但 `/api/v1/*`、不存在的 API、SSE 与导出路径绝不能被错误回退为 HTML。版本化静态资源使用长期缓存，入口 HTML 使用可更新的缓存策略；API 中的敏感响应不进入公开共享缓存。

### 13.4 性能与稳定性预算

以下为验收目标，需记录设备与测量方法，不可在未经测量前声称已经达标。

| 项目 | 目标 |
| --- | --- |
| 初始 JS | 目标不超过 300KiB gzip，延后加载的大型图表/日志分包单独记录 |
| 常规只读 API | 基准服务器上 p95 小于 300ms，不包含外网下载与大日志导出 |
| 界面操作 | 常规点击/展开反馈不被 1000 行进程表或高频日志阻塞 |
| 前端长时间使用 | 连续 30 分钟监控后，缓冲数量受上限约束，无持续单调内存增长 |
| 安装任务 | 浏览器刷新/关闭不丢任务；API 重试不重复执行 |
| 并发访问 | 多标签页不会各自创建安装任务、无限流连接或独立全量系统扫描 |
| 减少动效 | 系统开启 reduced-motion 后，不保留装饰性循环动画 |

### 13.5 Go + Gin 构建、静态资源与部署

以下命令是实现后需要支持的工程入口，不代表本文已经交付了对应后端源码。`go.mod` 的模块路径在建仓时按实际仓库固定；发布不能依赖本地未提交的 `replace`。开发与 CI 使用同一已锁定的 Go 工具链。

| 入口 | 必须执行的内容 |
| --- | --- |
| `make dev-web` | `pnpm --dir web dev`；本机 Vite 代理 `/api`，不直接调用另一个跨域前端 API 地址 |
| `make dev-server` | 在 `server/` 执行 `go run -tags devassets ./cmd/zx-panel serve --config ../configs/dev.json` |
| `make check-go` | 在 `server/` 检查 `gofmt`，执行 `go vet -tags devassets ./...`、`go test -tags devassets ./...`；检查 Go 依赖与生成文件无漂移 |
| `make test-race` | 在支持 race 的 CI 平台执行 `go test -race -tags devassets ./...`；准备所需 C 工具链，不能假定无 CGo 发布设置适用于 race 测试 |
| `make test-integration` | Go HTTP + 临时 SQLite / 文件系统集成测试；systemd / 辅助服务测试单独标记并在隔离 Linux 测试机运行 |
| `make build-web` | `pnpm --dir web install --frozen-lockfile` 后执行 `pnpm --dir web build`；真实发布显式使用 `VITE_DATA_MODE=api` |
| `make embed-web` | 清理并复制 `web/dist/` 到 `server/internal/webui/dist/`，验证入口及资源清单 |
| `make build` | 依次完成前端构建、资源同步、Go 主程序与辅助程序构建；记录版本、commit、构建工具链 |
| `make security` | 同步正式前端资源后执行固定工具版本的 `govulncheck ./...`、秘密扫描与依赖检查；记录漏洞库查询时间与结果 |
| `make verify` | 组合前后端检查、构建、契约测试及关键端到端场景，不跳过失败步骤 |

Go 漏洞扫描采用官方 `govulncheck` 工作流；扫描结果与工具/漏洞库更新时间一起留档，不能将一次通过解释为永久无漏洞。[^s25] race 测试按官方支持平台与 C 工具链要求执行；它只能发现已执行路径上的竞争，不代表所有并发路径都被证明正确。[^s26]

**静态资源内嵌。**`server/internal/webui/embed.go` 的最小资源封装可按下例实现；SPA 回退、缓存、安全头及 API 路由保护仍须在 HTTP 装配层完成。

```go
//go:build !devassets

package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var assets embed.FS

func FS() (fs.FS, error) {
	return fs.Sub(assets, "dist")
}
```

`go:embed` 在编译时将匹配资源编入程序；路径按当前包解析，因此构建先将前端产物同步到包内，而不是使用 `../../web/dist`。`all:` 会纳入隐藏/下划线开头的文件，复制与发布校验必须剔除秘密、缓存、测试数据和不应分发的 sourcemap。[^s20]

日常后端开发使用 `devassets` build tag：上面的 `embed.go` 只进入正式构建；另建 `assets_dev.go`（`//go:build devassets`），提供同名接口及明确的“未内嵌资源”状态，让开发模式只注册 API、不挂载 SPA。此模式下前端由 Vite 提供。开发检查使用该 tag；正式发布、SSE/静态资源联调与发布门禁必须在同步真实 `dist` 后再执行无该 tag 的构建和测试。真实发布禁止开发 tag，缺少 `dist/index.html` 或构建清单时失败，不用演示 HTML 兜底生产错误。

一个可执行的发布构建命令序列如下；前提是源码、锁文件、CLI 与构建包均已按本规范实现：

```bash
#!/usr/bin/env bash
set -euo pipefail

pnpm --dir web install --frozen-lockfile
VITE_DATA_MODE=api pnpm --dir web build

test -f web/dist/index.html
mkdir -p server/internal/webui
rm -rf server/internal/webui/dist
mkdir -p server/internal/webui/dist
cp -R web/dist/. server/internal/webui/dist/
mkdir -p dist

(
  cd server
  go mod verify
  go test ./...
  CGO_ENABLED=0 go build -mod=readonly -trimpath -o ../dist/zx-panel ./cmd/zx-panel
  CGO_ENABLED=0 go build -mod=readonly -trimpath -o ../dist/zx-panel-helper ./cmd/zx-panel-helper
)
```

这是面向原生 Linux 发布基线的本机构建示例，不是跨平台兼容性保证；目标 `GOOS/GOARCH`、动态链接依赖、运行时依赖和 SQLite 行为需分别验证。`make build` 还必须执行前端类型/测试、API 模式和秘密扫描等检查，不应仅照抄上面的最小序列作为完整发布门禁。

**生产部署基线：**面板主程序由 systemd 以非 root 账号运行，默认监听 `127.0.0.1:9876`；HTTPS 入口和受信代理由部署者显式配置。辅助服务使用独立 unit 与受限 Socket；其服务身份、Socket 权限和可操作目录单独审查，不能给 Web 服务配置无限制 sudo。

| 路径 / 文件 | 部署要求 |
| --- | --- |
| `/opt/zx-panel/zx-panel` | 主程序及内嵌前端；由部署身份拥有，运行账号不可自修改 |
| `/opt/zx-panel/zx-panel-helper` | 独立 Go 辅助程序；无 TCP 监听；只安装已审核的本机动作 |
| `/etc/zx-panel/config.json` | 运行账号可读、不可通过面板任意改写；与开发配置分离 |
| `/etc/zx-panel/keys/` | 密钥与数据库分离，最小读取权限；不进入前端资源与普通备份公开目录 |
| `/var/lib/zx-panel/` | SQLite、锁文件、任务输入、缓存与导出；各子目录遵守各自所有权，不统一放宽权限 |
| `/run/zx-panel-helper/control.sock` | 辅助服务通信端点，按 OS 对端身份认证；普通用户不可访问 |
| `deploy/systemd/*.service` | 描述主程序和辅助服务的权限、路径、启动依赖、日志与停服时限；真实安装验收 |

面板升级通过部署流程替换主程序及其内嵌资源，必要时运行数据库迁移；首发不自动添加“面板在线自更新”功能。面板升级与 Node.js / Go 用户运行时升级完全分开。不得承诺只回滚二进制就能兼容已升级数据库；回滚方案必须声明 schema 兼容性或使用已验证的备份恢复。

### 13.6 配置文件、开发联调与 CLI 契约

以下为 `configs/dev.example.json`，仅供开发使用；开发者复制为本机 `dev.json`，并将本机配置、数据目录与秘密目录加入 `.gitignore`。路径为演示的本机路径，不代表它们已创建、已授权或可安装运行时。

```json
{
  "mode": "development",
  "http": {
    "listen": "127.0.0.1:9876",
    "publicOrigin": "http://localhost:5173",
    "allowedHosts": ["localhost:5173", "127.0.0.1:9876"],
    "trustedProxies": [],
    "readHeaderTimeoutSeconds": 5,
    "readTimeoutSeconds": 15,
    "idleTimeoutSeconds": 60,
    "maxJsonBodyBytes": 1048576
  },
  "storage": {
    "databasePath": "./var/panel.db",
    "busyTimeoutMs": 5000,
    "maxReadConnections": 4
  },
  "paths": {
    "dataRoot": "./var",
    "runtimeRoot": "./var/runtimes",
    "stagingRoot": "./var/staging",
    "artifactCacheRoot": "./var/cache/artifacts",
    "exportRoot": "./var/exports",
    "appRoots": ["./var/apps"],
    "secretKeyFile": "./local-secrets/app-secrets.key"
  },
  "auth": {
    "cookieSecure": false,
    "idleTimeoutSeconds": 1800,
    "absoluteTimeoutSeconds": 43200
  },
  "metrics": {
    "sampleIntervalSeconds": 2,
    "filesystemIntervalSeconds": 15
  },
  "tasks": {
    "installerConcurrency": 1,
    "maxPendingTasks": 100
  },
  "privileged": {
    "enabled": false,
    "socketPath": "/run/zx-panel-helper/control.sock"
  }
}
```

所有相对路径以**配置文件所在目录**为基准解析并在启动时固定为绝对路径，不随当前工作目录变化。日志可显示非敏感配置路径，但不得显示秘密内容。开发配置关闭辅助服务意味着真实能力以探测结果为准：需要辅助权限的安装提交和 systemd 管理应明确不可用，而不是绕过权限或返回假成功。

配置优先级固定为：内置安全默认值 < 显式指定的配置文件 < 受允许的 `ZX_PANEL_*` 环境变量；CLI `--config` 只负责选文件，不接受执行主机或任意 shell 参数。配置存在未知字段、非法路径、冲突目录或不安全生产参数时启动失败。

允许覆盖的环境变量先限定为 `ZX_PANEL_LISTEN`、`ZX_PANEL_PUBLIC_ORIGIN`、`ZX_PANEL_LOG_LEVEL`。Cookie、安全边界、辅助权限、数据库路径等不接受任意环境变量自动映射；后续新增覆盖键必须通过审查。秘密不放入 `VITE_*`，也不通过日志回显配置。

开发联调由 Vite 将 `/api` 代理到 `http://127.0.0.1:9876`，保留浏览器原始 Host（`changeOrigin: false`），后端按配置的开发 Origin / Host 校验。前端统一使用 `/api/v1` 相对路径，不默认开放 `Access-Control-Allow-Origin: *`。Cookie 非 Secure 仅允许显式开发模式、回环绑定和本机开发入口；该配置不能用于生产部署。

生产配置必须改为明确的 HTTPS `publicOrigin`、`cookieSecure: true`、实际允许 Host、精确可信代理与绝对数据路径；开发账户、弱配置与 Mock 开关不能继承到生产。TLS 终止代理负责清理伪造转发头，后端继续执行 Host / Origin 与动作校验。

| Go CLI | 行为 |
| --- | --- |
| `zx-panel serve --config <path>` | 校验后启动服务；schema 未迁移或关键配置不合法时非零退出 |
| `zx-panel check-config --config <path>` | 只校验并输出脱敏错误；不执行任务、不初始化管理员 |
| `zx-panel setup-token --config <path>` | 经本机身份/权限检查后生成一次性短期初始化凭据；已初始化时拒绝 |
| `zx-panel migrate status --config <path>` | 检查 schema 版本；不修改数据库 |
| `zx-panel migrate up --config <path>` | 校验备份与独占条件后迁移；不允许与运行中的服务竞争写入 |
| `zx-panel backup --config <path> --output <path>` | 受控一致性备份，验证目的地权限；密钥备份单独说明 |
| `zx-panel version` | 输出程序版本、commit、构建 Go 版本；不启动 HTTP |

这些 CLI 是待实现的交付契约，不是已存在工具的使用声明。初始化凭据只在明确执行该命令的受控终端显示；不写服务启动日志，不放 URL。CLI 必须验证数据目录所有权，避免不同账号创建无法读写的数据库或密钥文件。

## 14. 测试与验收清单

### 14.1 视觉与产品验收

| 编号 | 验收项 | 通过条件 |
| --- | --- | --- |
| V01 | 品牌统一 | 所有页面/标题均为 zx-panel，无旧项目名残留 |
| V02 | 主题 | 六个主要页面及弹层都有亮/暗截图，亮白暗黑，无深蓝大背景 |
| V03 | 克制设计 | 无营销区、星球、无意义大屏装饰与范围外导航 |
| V04 | 本机范围 | 无服务器切换、添加主机、SSH/远程连接入口 |
| V05 | 布局 | 1440、1280、1024、768、390px 宽度无页面级横向溢出 |
| V06 | 数据层级 | 首屏能找到 CPU、内存、根分区、网络、主机信息与运行时入口 |
| V07 | 可访问性 | 键盘流程可完成；对比度与焦点可见；状态不只靠颜色 |
| V08 | 主题连续性 | 首次加载不闪错主题，手动偏好与跟随系统行为正确 |
| V09 | 内容真实性 | 无随机生产数据，无硬编码“最新”，无安装项“运行中”混淆 |

### 14.2 功能与边界验收

| 编号 | 场景 | 预期 |
| --- | --- | --- |
| F01 | 空服务器 | 展示空态与安装入口，不出现虚构运行环境 |
| F02 | Node.js / Go 安装 | 完整预检、真实进度、校验、登记与结果核验 |
| F03 | 第二版本安装 | 保留旧版本，默认设置与应用绑定不被暗改 |
| F04 | 默认切换 | 只改变面板预选，不自动修改系统 PATH 或重启应用 |
| F05 | 卸载被引用版本 | 后端拒绝，UI 展示引用及解除方式 |
| F06 | 外部安装 | 只读，不可卸载、不被重写 |
| F07 | Go 工具链升级 | 不显示“启动 Go”，不宣称已更新已有 Go 二进制应用 |
| F08 | 应用启停/重启 | 任务可追踪；失败有具体原因；未知进程不能任意重启 |
| F09 | 应用配置更改 | 保存与重启分开；未应用配置有明确提示 |
| F10 | 幂等 | 重复点击/请求超时重发最多创建一个对应任务 |
| F11 | 并发状态变更 | 预检后被引用或 revision 改变时重新校验，不误删 |
| F12 | 安装中断 | 重启面板后任务被核实/标记中断，不盲目重放或留虚假成功 |
| F13 | 非支持平台/无权限 | 只读可用功能正常，写操作被后端拒绝并解释 |
| F14 | 无外网 | 本机读取继续；目录显示缓存时间，未验证缓存不伪装可安装 |
| F15 | 日志查看 | 来源、级别、暂停、跟随、截断和权限正确 |
| F16 | 会话过期 | 读取/写入/现有 SSE/导出均停止授权 |

### 14.3 数据与实时验收

| 编号 | 场景 | 预期 |
| --- | --- | --- |
| D01 | 首次 CPU/速率样本 | 显示 warming-up，不出现伪造的 0 |
| D02 | 内存口径 | 使用 MemAvailable，数值/百分比/单位一致 |
| D03 | 进程多核占用 | 可以大于 100%，有口径说明，不被截断 |
| D04 | 不同采集频率 | 文件系统按自己的时间判断 freshness |
| D05 | SSE 暂停/断网 | 保留最后值，显示过期，启用有上限的回退 |
| D06 | SSE 重复/乱序 | 数值不回退、不重复累计日志或任务 |
| D07 | 服务或主机重启 | epoch/bootId 变化正确重建状态 |
| D08 | 游标过期 | 触发 reset 和重新同步，不假称日志完整 |
| D09 | 不足 24h 历史 | 显示实际覆盖范围，缺口不断言为零 |
| D10 | 日志持续高吞吐 | 有界缓冲、批处理、截断/丢弃计数可见 |

### 14.4 安全测试

必须覆盖未经授权的读取/写入、CSRF、伪造 Host/Origin、初始化凭据重放、路径穿越、解包链接逃逸、下载重定向绕过、错误来源校验、unit 配置注入、命令参数混入 shell、外部安装修改、任意日志路径读取、令牌/环境秘密泄漏、会话失效后流持续可读等场景。

输入边界至少覆盖：空值、超长值、Unicode 路径、空格、引号、换行、控制字符、失效资源 ID、失效游标、负数/超大 limit、同一幂等键不同 payload、执行期间磁盘满和权限撤销。

可识别控件边界与焦点等非文本信息按至少 3:1 的相关对比度目标验收；装饰性线条与必需操作边界应区分。参考 WCAG 非文本对比度说明。[^s15]

### 14.5 完成定义

功能必须同时满足：UI 正常状态可用、加载/空/错/过期/权限状态完整、真实接口已联调、危险操作后端已保护、测试通过、双主题与响应式通过、构建成功、无已知秘密泄漏。只完成静态页面截图不算功能完成。

尚未接入的动作必须在演示模式里明确标识或禁用，不能用 Toast 模拟生产成功。开发报告区分“已实现”“Mock 可演示”“尚未接入”三类。

### 14.6 Go + Gin 后端专项验收

| 编号 | 场景 | 必须通过的结果 |
| --- | --- | --- |
| B01 | 技术约束与包边界 | 后端使用 Go + Gin；业务包不依赖 Gin，Handler 不直接下载、执行命令或拼 SQL |
| B02 | 严格 JSON | 拒绝未知/重复键、大小写别名、null 顶层、多段 JSON 与超大输入；`makeDefault: false` 合法，缺失非法 |
| B03 | HTTP 一致性 | 正常与错误响应符合 OpenAPI；API 404/405 不是 HTML；错误方法带正确 Allow |
| B04 | 代理与跨站 | 伪造转发头不影响未受信来源身份；初始化、登录、已登录写入均检查适用 CSRF / Origin |
| B05 | Gin 生命周期 | 任务不保留 Gin Context；请求返回/客户端断开不终止已提交任务；race 无数据竞争 |
| B06 | 持久受理 | 并发同键仅一任务；事务失败无半成品；提交后通知丢失可由扫描恢复 |
| B07 | 数据库存储 | 每连接外键等配置生效；短事务、busy 错误可见；迁移/备份/恢复覆盖实际 WAL 场景 |
| B08 | SSE 与代理 | 真实代理下持续运行超过短请求时限；慢订阅者不阻塞采集，退出/过期后流及时关闭 |
| B09 | 资源释放 | 反复进入/退出日志页、断流重连后 goroutine、ticker、文件描述符与队列不持续累积 |
| B10 | 排空与重启 | 停服时关闭流、停止认领并保存任务证据；不提前关闭数据库；重启无假成功或盲目重放 |
| B11 | 本机权限 | Web 主程序非 root；辅助服务不监听 TCP，未授权 Socket 调用失败；目录/应用账号边界有效 |
| B12 | 发布产物 | Go 主程序内嵌真实 API 模式前端；目标机无 Node.js/Go CLI 仍能启动面板；无开发占位资源 |
| B13 | 构建与漏洞 | 前端与 Go 全部构建检查通过，依赖锁定；漏洞检查与未解决风险有记录，不伪称绝对安全 |
| B14 | 工具链隔离 | 面板内更新/卸载用户 Go 工具链不影响面板主程序、构建版本信息或其他已编译应用 |

单元测试使用 `httptest`、临时 SQLite 和受控文件夹；涉及 systemd、辅助权限、真实安装归档与服务排空的测试在隔离 Linux 环境执行。不得在开发者正在运行的服务器上直接执行破坏性集成测试。

## 15. 实施拆分与交付里程碑

| 阶段 | 交付内容 | 进入下一阶段的门槛 |
| --- | --- | --- |
| M0：基础骨架 | React 工程、Token、主题、AppShell；Go module、Gin 路由/中间件骨架、配置与 CLI | 前端 build/typecheck、Go 格式/vet/test/build 通过，亮暗导航和错误契约完整 |
| M1：页面与 Mock | 六个主页面、运行时详情、任务/确认抽屉、全部异常场景 | 页面可交互，Mock 遵守契约，视觉验收通过 |
| M2：本机只读数据 | Go 会话/能力、本机采集器、系统进程/日志、Gin SSE 与 SQLite 迁移 | 数据口径、严格输入、续传、权限、过期与资源释放测试通过 |
| M3：运行时管理 | Go 目录适配、安装/默认/卸载、SQLite 持久任务与受限辅助动作 | 校验、事务幂等、引用保护、资源锁与中断恢复通过 |
| M4：托管应用 | 应用配置、启停、具体版本绑定、应用日志 | 非特权边界与生命周期测试通过 |
| M5：发布质量 | Go 内嵌前端发布、systemd 部署、排空、备份恢复、漏洞检查与全链路验收 | 无假数据、无无效按钮、主/辅助程序构建及目标机验收记录完整 |

M2 之前，所有真实服务器写操作均不启用。Python、系统包管理、交互式终端等任何扩展进入独立需求评审，不借实施过程自动扩张首发范围。

开发交付应包含：React / Go 源码、前端 lockfile 与 `go.mod` / `go.sum`、OpenAPI、SQLite 迁移、Go 与前端测试/场景 fixtures、主程序及辅助程序构建脚本、示例配置与 systemd 单元、双主题关键页面截图、运行/部署/备份说明、权限说明、已知限制清单；每个接口与功能标明当前接入状态。

## 16. 可直接交给开发者或编码助手的实施说明

> 请依据本规范实现 zx-panel，而不是生成宣传页面或只包含静态数字的首页。
>
> 使用 React、TypeScript、shadcn/ui 与语义主题变量。先完成双主题 AppShell 和六个核心页面，再接入本机 API。亮模式以白色为主，暗模式以黑色/炭灰为主，只使用少量信号色；不添加星球、粒子、霓虹边框或范围外菜单。
>
> 后端必须使用 Go（Golang）+ Gin，按第 12.5–12.12 节与第 13 章组织工程。采用薄 Handler、独立业务服务、本机平台适配器、database/sql + SQLite 持久化、Go worker 与有界 SSE。业务服务不能依赖 Gin Context；已受理任务不能绑定浏览器请求生命周期。生产由 Go 主程序内嵌并提供 React 静态资源。
>
> 管理对象固定为面板所在服务器，不实现服务器选择器、SSH、远程 Agent 或跨主机操作。首发运行时为 Node.js 和 Go，明确区分已安装工具链、面板默认版本、应用绑定与应用运行状态。用户管理的 Go 工具链不得与构建面板自身的 Go 环境混为一谈。
>
> 运行时安装/卸载/默认切换和应用变更使用“预检—确认—任务—核验”，严格遵守幂等、引用保护与外部安装只读。所有危险动作由后端再次授权与校验，前端不能通过伪成功提示代替执行结果。
>
> 未接入后端前使用独立 Mock 模式，展示演示标记，覆盖空、错、权限不足、断流、任务中断与日志爆量。完成每个阶段时列出实际文件变更、已通过的测试、Mock 与真实接入的边界，以及剩余问题；不得把未经测试的效果或性能称为已经实现。

## 17. 技术参考与来源

以下链接用于核对框架用法、指标含义和安全基线，不是对本文自定义业务规则的外部背书。原版参考条目保留；本次新增 Go / Gin / SQLite 参考于 2026-09-28 核对。实现时以锁定版本对应的官方文档为准。本文未指定 Node.js/Go 的“当前最新版本”。

[^s01]: shadcn/ui，Vite 安装与既有项目接入。`https://ui.shadcn.com/docs/installation/vite`
[^s02]: shadcn/ui，Theming：语义变量、主题角色与自定义 Token。`https://ui.shadcn.com/docs/theming`
[^s03]: Tailwind CSS，Dark mode：class 驱动与自定义 dark variant。`https://tailwindcss.com/docs/dark-mode`
[^s04]: shadcn/ui，Vite Dark Mode：ThemeProvider 与切换方式。`https://ui.shadcn.com/docs/dark-mode/vite`
[^s05]: React，Choosing the State Structure：避免冗余与矛盾状态。`https://react.dev/learn/choosing-the-state-structure`
[^s06]: shadcn/ui，Chart：Recharts 组合、尺寸、主题与可访问性。`https://ui.shadcn.com/docs/components/base/chart`
[^s07]: TanStack Query，Important Defaults：stale、refetch 与 retry 的默认行为。`https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults`
[^s08]: MDN，Using server-sent events：流格式、事件 ID、重连与连接管理。`https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events`
[^s09]: W3C WAI，WCAG 2.2 Understanding 1.4.3：文字对比度。`https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html`
[^s10]: Node.js，Node.js Releases：官方发布与维护状态。`https://nodejs.org/en/about/previous-releases`
[^s11]: Go，Download and install：工具链安装与旧安装目录注意事项。`https://go.dev/doc/install`
[^s12]: Linux Kernel，The /proc Filesystem：CPU 统计、内存与其他内核暴露指标。`https://docs.kernel.org/filesystems/proc.html`
[^s13]: OWASP，Cross-Site Request Forgery Prevention Cheat Sheet。`https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html`
[^s14]: Go，Compile and install the application：编译产物与工具链的区分。`https://go.dev/doc/tutorial/compile-install`
[^s15]: W3C WAI，WCAG 2.2 Understanding 1.4.11：非文本对比度。`https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html`
[^s16]: Vite，Env Variables and Modes：客户端环境变量与秘密保护。`https://vite.dev/guide/env-and-mode`

[^s17]: Gin 官方 Go 包文档：Engine、Route Group、中间件、Context、请求绑定和 SetTrustedProxies。`https://pkg.go.dev/github.com/gin-gonic/gin`
[^s18]: Go 标准库 net/http：Server、ResponseController、TimeoutHandler、超时与 Shutdown。`https://pkg.go.dev/net/http`
[^s19]: Go 标准库 encoding/json：Decoder、DisallowUnknownFields 与输入兼容性/解析行为。`https://pkg.go.dev/encoding/json`
[^s20]: Go 标准库 embed：编译期嵌入、路径规则、all 前缀和 embed.FS。`https://pkg.go.dev/embed`
[^s21]: SQLite 官方 Write-Ahead Logging：读写并发、单写者、检查点与文件管理。`https://www.sqlite.org/wal.html`
[^s22]: modernc.org/sqlite 维护方包文档：无 CGo 驱动、连接配置、DSN 与 PRAGMA。`https://pkg.go.dev/modernc.org/sqlite`
[^s23]: Go 标准库 os/exec：命令与参数、CommandContext、取消与进程执行边界。`https://pkg.go.dev/os/exec`
[^s24]: Go 官方 Executing transactions：database/sql 事务的正确调用与提交/回滚。`https://go.dev/doc/database/execute-transactions`
[^s25]: Go 官方 Vulnerability Management：govulncheck 与 Go 漏洞管理。`https://go.dev/doc/security/vuln/`

[^s26]: Go 官方 Data Race Detector：使用方式、覆盖限制、支持平台与 CGo/C 编译器要求。`https://go.dev/doc/articles/race_detector`
