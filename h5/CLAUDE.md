# CLAUDE.md — hermes-h5

> 这是 Claude Code 在本仓库工作时的**首要上下文文件**。它定义了项目架构、开发规范与
> 必须遵守的技术约束。先读这份文件，再动代码。
> 用户的全局开发规则（~/.claude/rules/ecc/）仍然适用；本文件仅补充**本项目特有**的内容。
> 限定中文回复
## 一句话简介

基于 **Nuxt 3** 的 Hermes Agent API Server 客户端，全局 **iOS 26 · Liquid Glass** 风格。
提供**会话历史 / 新增会话 / 会话详情对话（SSE 流式）**，通过 Nuxt server routes 代理调用 Hermes。

## 技术栈

| | |
|---|---|
| 框架 | Nuxt **3.21.8**（Nitro **2.13.4**，Vite 7，Vue **3.5.39**）|
| 语言 | TypeScript（`tsconfig.json` 继承 `.nuxt/tsconfig.json`）|
| 运行时 | Node **22+** |
| 样式 | 纯 CSS 设计系统（无 Tailwind / 无 UI 库）—— 4 个 token/材质/动效文件 |
| 后端 | Hermes Agent API server（OpenAI 兼容 + Sessions API） |

## 常用命令

```bash
npm install            # 安装依赖（postinstall 自动 nuxt prepare）
npm run dev            # 开发，默认 http://localhost:3111
npm run build          # 生产构建 → .output/
node .output/server/index.mjs   # 运行生产服务
npm run generate       # 静态生成（本项目用 SSR，一般不需要）
```

环境变量见 `.env`（从 `.env.example` 复制）：`HERMES_BASE_URL`、`HERMES_API_KEY`。

## 架构总览

```
浏览器 (Liquid Glass UI)
  │  $fetch / fetch
  ▼
composables/   ← 唯一允许直接调代理路由的层（useHermes / useSessions / useChat）
  │
  ▼
server/api/hermes/**   ← Nitro 代理层：注入 Bearer Key、转发、统一错误
  │  fetch (服务端)
  ▼
Hermes API server  (默认 http://127.0.0.1:8642)
```

**核心设计决策：所有 Hermes 调用必须经过 `server/api/hermes/**` 代理，禁止在浏览器直连 Hermes。**
原因：(1) API Key 仅存服务端 `runtimeConfig.hermesApiKey`，不泄露到前端；(2) 无需为 Hermes 配置 CORS。

数据流细分见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 目录结构

```
h5/
├── app.vue                    # 根：aurora 背景 + <NuxtLayout> + <ToastHost>
├── nuxt.config.ts             # runtimeConfig + CSS + experimental.appManifest:false
├── assets/css/                # 设计系统（见下「设计系统」）
├── components/                # 自动导入，PascalCase
│   ├── AppHeader / EmptyState / SessionCard / MessageBubble
│   ├── ComposeBar / ToolIndicator / PromptDialog
│   ├── HealthPill / ToastHost
│   └── GlassIcon              # 内联 SVG 图标库（无图标依赖）
├── composables/               # 自动导入，camelCase + use 前缀
│   ├── useHermes.ts           # API 客户端（唯一访问 /api/hermes 的入口）
│   ├── useSessions.ts         # 会话列表共享状态（useState）
│   ├── useChat.ts             # 单会话对话 + SSE 流式（useState）
│   ├── useToast.ts            # 通知
│   ├── useMarkdown.ts         # 安全的 markdown→HTML
│   └── useTime.ts             # 时间格式化
├── pages/
│   ├── index.vue              # 会话历史
│   └── chat/[id].vue          # 会话详情对话
├── server/
│   ├── utils/hermes.ts        # 共享 hermesFetch 助手（注入 Key/错误归一）
│   └── api/hermes/            # 代理路由（见下表）
└── types/hermes.ts            # Hermes 数据模型（带宽松 index signature）
```

## ⚠️ 必须遵守的技术约束（踩坑总结，违反会引入难查的 bug）

### 1. 流式路由必须是**终端参数**：`server/api/hermes/stream/[id].post.ts`

**绝不能**把它「重构」回 `/sessions/:id/chat-stream`。
当前 Nitro/rou3 版本下，`:id` 参数节点下的 **POST 静态子路由**会**间歇性路由失配**（已用
15/15 压测复现；表现为 Nitro 把请求落到 Vue Router 返回 404，且只在首个流式请求后出现）。
改用终端参数 `/api/hermes/stream/:id` 后 100% 稳定。**任何新增带 body 的动态路由都应让参数位于路径末尾。**

### 2. 单会话响应被包裹在 `.session` 里

`POST /api/sessions`、`GET /api/sessions/{id}`、`PATCH` 都返回 `{ object, session: {...} }`。
必须用 `useHermes.ts` 里的 `unwrapSession()` 解包；列表/消息接口则返回 `{ data: [...] }`，
已由 `asArray()` 归一。**新增端点时先确认真实 envelope，别假设裸对象。**

### 3. 字段名以 Hermes 实测为准（不是 OpenAI/直觉）

- Session：`started_at` / `ended_at` / `last_active`（unix 秒，float）、`preview`（首条消息，
  `title` 为空时用它做标题）、`message_count`、`source`、`model`。**没有** `created_at`/`updated_at`。
- Message：`timestamp`（unix 秒）、`content`（string）、`role`、`tool_calls`、`reasoning`。**没有** `created_at`。
- 时间格式化统一走 `useTime`，它会正确处理 unix 秒。

### 4. SSE 事件名（`/api/sessions/{id}/chat/stream` 实测）

`run.started` → `message.started` → `assistant.delta`（`{delta}`）→
`tool.progress`（`{tool_name, delta}`，含 `_thinking`）→ `assistant.completed` → `run.completed`。
`useChat.handleEvent()` 已适配全部；**新增事件类型请加 case 并写 extract 兜底**（数据字段名会变）。

### 5. `useState` 必须在 composable 函数体内调用，**禁止模块顶层**

否则 SSR 报 `composable ... called outside ... Nuxt instance`（500）。
`useToast` 曾因此 bug，已修。所有 `useState` 都在 `useXxx()` 内部。

### 6. `experimental.appManifest: false` 必须保留

否则 dev 下持续刷 `Failed to resolve import "#app-manifest"`。本项目不用 route rules，可安全关闭。

### 7. 流式转发用 h3 原生 `sendWebResponse(event, upstream)`

**不要**用 `sendStream(Readable.fromWeb(...))` + 手动 abort 监听——会污染连接/路由状态。
见 `server/api/hermes/stream/[id].post.ts`。

## 开发规范（本项目特有；通用规则见全局 ecc rules）

- **不可变更新**：`useState` 的值用展开运算符返回新数组/对象（`[...arr]`、`{...obj}`），禁止原地 mutate。
- **禁止 `console.log`**：错误统一用 `useToast()` 弹给用户；服务端用 `createError()` 归一。
- **输入校验在边界**：server route 校验 path param / body；client composable 不重复信任。
- **错误归一**：所有上游错误经 `hermesFetch` 包成 `createError`；client 读 `err.data.message`。
- **文件组织**：按功能聚合，单文件 < 800 行；新增图标加到 `GlassIcon.vue` 的 `ICONS` map。
- **样式**：颜色/圆角/阴影/动效一律用 `assets/css/tokens.css` 的 CSS 变量，**禁止硬编码**；
  新增玻璃元素用 `.glass` / `.glass--strong` / `.glass--subtle`，不要重复造 backdrop-filter。
- **组件命名**：PascalCase；composable 用 `use` 前缀；CSS class 用 kebab-case。
- **类型**：Hermes 模型保留 `[key: string]: unknown` index signature，容忍上游加字段；
  对外 API 显式标注参数与返回类型。

## 设计系统速查（`assets/css/`）

- `tokens.css` —— 设计 token：色板（accent 渐变）、光暗主题（`prefers-color-scheme` + `[data-theme]`）、
  圆角/阴影/间距/动效 cubic-bezier/字体。**改视觉先改这里。**
- `glass.css` —— Liquid Glass 材质：`.glass`（折射高光边 `::before` + 顶部 sheen `::after` +
  内发光 + 飘浮阴影）、`.glass-btn`、`.glass-input`、`.aurora`（动态极光背景）、`.chip`。
- `animations.css` —— 关键帧（`drift`/`fade-in-up`/`blink`/`pulse-ring`/`spin`）与工具类
  （`.anim-*`、`.stagger`、`.skeleton`、`.typing-dots`、`.stream-caret`）。
- `base.css` —— reset、排版、滚动条、`.page` 路由过渡、`prefers-reduced-motion`。

## 验证清单（改完代码后照做）

后端 Hermes 默认在线（127.0.0.1:8642，key `change-me-local-dev`），可直接端到端验证：

```bash
# 1. 路由全部 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3111/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3111/api/hermes/sessions

# 2. 流式必须稳定（连测多次不出现 404）
SID=$(curl -s -X POST http://localhost:3111/api/hermes/sessions -H "Content-Type: application/json" -d '{}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).session.id))")
curl -sN -X POST "http://localhost:3111/api/hermes/stream/$SID" -H "Content-Type: application/json" \
  -d '{"input":"Reply with one word: ok"}' --max-time 60   # 应看到 assistant.delta "ok" + run.completed

# 3. 生产构建通过
npm run build
```

**回归红线**：流式路由出现任何 404，立即检查是否被改回非终端参数路径。

## 进一步阅读

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) —— 分层架构、SSE 流式管线、状态管理细节
- [`docs/PROXY_API.md`](./docs/PROXY_API.md) —— 代理路由表 + Hermes 实测请求/响应结构
- [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) —— 组件/Composable/CSS 编写规范与扩展指南
- [`README.md`](./README.md) —— 面向使用者的安装与运行说明
