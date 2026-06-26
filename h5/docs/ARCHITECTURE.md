# 架构文档

本文深入解释 hermes-h5 的分层、数据流与关键设计决策。快速上手先读 [`../CLAUDE.md`](../CLAUDE.md)。

## 1. 分层与职责边界

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器                                                       │
│  pages/*.vue          仅做编排：取数、绑定事件、渲染组件      │
│    └─ components/*    纯展示 + 局部交互，不直接发请求          │
│         └─ composables/*  状态与逻辑：useHermes/useSessions/useChat │
└──────────────────────────┬──────────────────────────────────┘
                           │ $fetch / fetch → /api/hermes/**
┌──────────────────────────▼──────────────────────────────────┐
│ Nitro 服务端（server/）                                       │
│  api/hermes/**         代理路由：校验 → 转发 → 归一错误        │
│    └─ utils/hermes.ts  hermesFetch：注入 Bearer Key、超时、统一 throw │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetch（服务端，带 Authorization）
┌──────────────────────────▼──────────────────────────────────┐
│ Hermes API server  http://127.0.0.1:8642                     │
│  /api/sessions/**      会话 CRUD + 消息 + SSE 流式对话        │
│  /v1/chat/completions  无状态 OpenAI 兼容（本项目未用）        │
└─────────────────────────────────────────────────────────────┘
```

**边界规则**：
- `components/` **禁止**直接 `$fetch`。所有请求经 `composables/useHermes.ts`。
- `composables/` 只访问 `/api/hermes/**`，**禁止**拼 Hermes 直连 URL。
- `server/api/hermes/**` 是唯一持有 `hermesApiKey` 的层。

## 2. 代理层为什么必要

1. **密钥隔离**：`HERMES_API_KEY` 放在 `runtimeConfig`（仅服务端），浏览器永远拿不到。
2. **免 CORS**：Hermes 默认不开 CORS；代理后浏览器同源请求 Nuxt，不存在跨域。
3. **错误归一**：`hermesFetch` 把上游 4xx/5xx/网络错误统一包成 h3 `createError`，
   前端只需处理 `{ data: { message } }` 一种形态。
4. **可观测**：未来加日志/限流/缓存只需改代理层。

`server/utils/hermes.ts` 的 `hermesFetch(options)` 负责：拼 URL（`buildUrl`）、注入
`Authorization: Bearer ${key}`、可选超时（`AbortSignal.timeout`）、按 `content-type` 解析返回体、
非 2xx `throw createError`。

## 3. 状态管理

全部用 Nuxt **`useState`**（SSR 安全、跨组件共享、跨路由保留）。**不用 Pinia**（依赖与复杂度不值得）。

| Composable | 共享 key | 用途 |
|---|---|---|
| `useSessions` | `hermes:sessions*` | 会话列表、loading/error、create/remove/rename |
| `useChat` | `hermes:chat:*` | 当前会话消息、流式 draft、工具进度、pending |
| `useToast` | `hermes:toasts` | 通知队列 |

约定：
- `useState` **必须在 `useXxx()` 函数体内调用**（不能模块顶层，否则 SSR 500）。
- 更新用不可变写法：`sessions.value = [session, ...sessions.value]`，不要 `push`/原地改。
- `useChat` 的状态是全局 key，组件卸载时调 `reset()` 清理，避免串会话。

## 4. SSE 流式管线（最关键也最易出问题）

```
ComposeBar 发送
  → useChat.send(id, text)
     · 乐观追加 user 消息
     · controller = new AbortController()
     · useHermes.streamChat(id, {input}, onEvent, signal)
        fetch POST /api/hermes/stream/:id  （流式响应）
        用 reader 循环读 body，按 "\n\n" 切 SSE 帧
        parseSseFrame() 解析 event: / data: 行，JSON.parse(data)（失败则当纯文本）
        每帧 onEvent(ev)
     · handleEvent(ev) 累积 draftContent / 记录 tool 进度 / 收尾
     · finally finalizeDraft()：把 draft 推入 messages，清状态
```

事件映射（实测 Hermes `/api/sessions/{id}/chat/stream`）：

| 事件 | 数据字段 | 处理 |
|---|---|---|
| `run.started` | `run_id, session_id` | （忽略，仅日志） |
| `assistant.delta` | `delta` | `draftContent += delta` |
| `tool.progress` | `tool_name, delta` | `addTool()` 显示工具/`_thinking` 思考态 |
| `assistant.completed` | `content` | 兜底：draft 为空时采纳 |
| `run.completed` | `messages[], usage` | 兜底 + 收尾 |
| `run.failed` / `error` | `message` | `error.value = ...` |

UI 状态机（`pages/chat/[id].vue`）：
- `pending && !hasDraft && tools` → 显示「思考中…」+ 工具胶囊
- `pending && hasDraft` → 流式 `MessageBubble`（带 `.stream-caret`）
- 完成 → 消息固化，`stick` 滚动到底

**为什么用 `fetch`+手动解析而不是 `EventSource`**：`EventSource` 只支持 GET；
Hermes 的流式是 POST。`useHermes.streamChat` 用 `ReadableStream` reader 手动切帧。

## 5. 路由结构决策

- 会话相关只读/写用 Nitro 文件路由：`sessions/index.{get,post}.ts`、`sessions/[id]/index.{get,patch,delete}.ts`、
  `sessions/[id]/messages.get.ts`。这些是 GET/PATCH/DELETE，**静态子段在 `:id` 下没问题**。
- **流式**用 `stream/[id].post.ts`（终端参数）。原因见 CLAUDE.md「技术约束 #1」：
  POST 静态子段在 `:id` 下间歇失配。这是**唯一**需要特殊处理的端点。

## 6. 渲染与安全

- assistant 消息走 Markdown：`useMarkdown.render()` 先转义 HTML 再套格式（`v-html` 安全）。
  支持 fenced code / inline code / 标题 / 列表 / 链接（仅 http(s)/mailto）/ 引用 / 分割线。
- user 消息纯文本，转义后保留换行（`<br>`）。
- 链接 `target="_blank" rel="noopener noreferrer"`。

## 7. 构建产物

- `npm run build` → `.output/server/`（Nitro Node 服务）。路由 chunk 在
  `.output/server/chunks/routes/api/hermes/...`。
- 生产运行：`node .output/server/index.mjs`（可用 `PORT=` 指定端口）。
- `.nuxt/` 与 `.output/` 均在 `.gitignore`，出问题可安全删除重建。
