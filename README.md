# ZX Panel Frontend

前端已从 Next.js App Router 切换为 `Vite + React + TypeScript`。

## 开发命令

```bash
pnpm dev
```

默认开发地址为 [http://localhost:5173](http://localhost:5173)。

## 可用脚本

- `pnpm dev`: 启动 Vite 开发服务器
- `pnpm build`: 构建生产产物到 `dist/`
- `pnpm start` / `pnpm preview`: 本地预览构建结果
- `pnpm lint`: 运行 ESLint
- `pnpm lint:fix`: 自动修复可修复的 ESLint 问题

## 前端结构

- `index.html`: Vite HTML 入口
- `src/main.tsx`: React 挂载入口
- `src/App.tsx`: 主应用与路径分发
- `src/styles.css`: 全局样式

## 路径说明

当前保留了原有页面语义：

- `/`
- `/nginx`
- `/nginx/index`

如果生产环境需要直接访问这些深路径，静态服务器需要将未知请求回退到 `index.html`。
