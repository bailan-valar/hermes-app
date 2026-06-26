# 代理 API 参考

本文记录 `server/api/hermes/**` 代理路由，以及 Hermes 上游的**实测**请求/响应结构。
这些结构是通过逆向运行中的 Hermes 0.17.0 得到的，**官方文档未完整公开**，以本文为准。

## 路由总表

| 代理路由 (Nuxt) | 方法 | Hermes 上游 | 客户端入口 |
|---|---|---|---|
| `/api/hermes/health` | GET | `/health` | `useHermes.health()` |
| `/api/hermes/sessions` | GET | `/api/sessions?limit&offset&source&include_children` | `useHermes.listSessions()` |
| `/api/hermes/sessions` | POST | `/api/sessions` | `useHermes.createSession()` |
| `/api/hermes/sessions/:id` | GET | `/api/sessions/{id}` | `useHermes.getSession()` |
| `/api/hermes/sessions/:id` | PATCH | `/api/sessions/{id}` | `useHermes.updateSession()` |
| `/api/hermes/sessions/:id` | DELETE | `/api/sessions/{id}` | `useHermes.deleteSession()` |
| `/api/hermes/sessions/:id/messages` | GET | `/api/sessions/{id}/messages` | `useHermes.getMessages()` |
| `/api/hermes/stream/:id` | POST | `/api/sessions/{id}/chat/stream` | `useHermes.streamChat()` |

> ⚠️ 流式路由是**终端参数** `/stream/:id`，不是 `/sessions/:id/chat-stream`。
> 原因见 CLAUDE.md「技术约束 #1」。

## 认证

所有上游请求由 `server/utils/hermes.ts` 注入：
```
Authorization: Bearer ${runtimeConfig.hermesApiKey}
```
默认 `change-me-local-dev`，可用 `HERMES_API_KEY` 覆盖。前端无需也无法接触该值。

## 响应 envelope（重要）

Hermes 的 envelope 不统一，`useHermes` 已在客户端归一：

| 接口 | 上游返回 | 客户端得到 |
|---|---|---|
| 列表 `GET /sessions` | `{ object:"list", data:[...] }` | `HermesSession[]`（经 `asArray`，按 `last_active` 倒序） |
| 消息 `GET /:id/messages` | `{ object:"list", session_id, data:[...] }` | `HermesMessage[]` |
| 单会话 `GET/POST/PATCH` | `{ object:"hermes.session", session:{...} }` | `HermesSession`（经 `unwrapSession`） |
| 删除 `DELETE` | `{ object:"hermes.session.deleted", id, deleted:true }` | 原样（客户端忽略） |

## 数据模型（`types/hermes.ts`）

### HermesSession
```ts
{
  id: string
  title: string | null              // 可能为空 → 用 preview 兜底
  source: string | null             // 如 "api_server"
  model: string | null
  started_at: number | null         // unix 秒 (float)
  ended_at: number | null
  last_active: number | null        // ★ 排序与时间显示的首选字段
  message_count: number
  tool_call_count: number
  parent_session_id: string | null
  preview: string                   // ★ 首条消息预览，title 为空时当标题
  end_reason: string | null
  // + token 用量、cost 等字段（UI 暂未用）
}
```

### HermesMessage
```ts
{
  id: number
  session_id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | null            // string；历史消息不含 multimodal 数组
  timestamp: number                 // unix 秒 (float)
  tool_calls: ToolCall[] | null
  tool_call_id: string | null
  tool_name: string | null
  finish_reason: string | null      // 'stop' 等
  reasoning: string | null          // 思维链（可选展示）
  reasoning_content: string | null
  token_count: number | null
}
```

## SSE 流式帧（`POST /api/sessions/{id}/chat/stream`）

`Content-Type: text/event-stream`，标准 SSE（`event:` / `data:` 行，帧以空行分隔）。
完整一轮示例（实测）：

```
event: run.started
data: {"user_message":{"role":"user","content":"hi"},"session_id":"...","run_id":"run_...","seq":1,"ts":1782444787.0}

event: message.started
data: {"message":{"id":"msg_...","role":"assistant"},"session_id":"...","run_id":"run_...","seq":2,"ts":...}

event: assistant.delta
data: {"message_id":"msg_...","delta":"Ready","session_id":"...","run_id":"run_...","seq":3,"ts":...}

event: tool.progress
data: {"message_id":"msg_...","tool_name":"_thinking","delta":"...","session_id":"...","run_id":"run_...","seq":6,"ts":...}

event: assistant.completed
data: {"session_id":"...","message_id":"msg_...","content":"Ready when you are.","completed":true,"partial":false,"interrupted":false,"run_id":"run_...","seq":7,"ts":...}

event: run.completed
data: {"session_id":"...","message_id":"msg_...","completed":true,"messages":[{"role":"assistant","content":"...","finish_reason":"stop","reasoning":"...","reasoning_content":"..."}],"usage":{"input_tokens":...,"output_tokens":...}}
```

`useHermes.parseSseFrame()` 处理：跳过注释行（`:` 开头）、合并多行 `data:`、`JSON.parse`
（失败则包成 `{value: raw}` 纯文本兜底）。`useChat.handleEvent()` 映射事件名到 UI 行为。

## 错误形态

代理失败统一抛 h3 `createError`，前端 `$fetch` 拒绝时拿到：
```ts
{
  statusCode: number,          // 400 校验失败 / 上游状态码 / 502 上游不可达
  statusMessage: string,
  data: { message: string, detail?: string } | unknown
}
```
读取用户消息：`err.data?.message ?? err.message`（`useSessions`/`useToast` 已封装）。

| 场景 | 状态码 |
|---|---|
| 缺 `:id` / 空 `input` | 400 |
| 上游会话不存在 | 404（由 `hermesFetch` 透传上游 404） |
| 上游不可达 / 超时 | 502 |
| 流式路由间歇失配（**不应出现**） | 404 + Vue Router 告警 → 见约束 #1 |

---

## 上游 API 全量参考（官方文档）

> 来源：[Hermes API Server 官方文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
> 本节是 Hermes API Server（OpenAI 兼容）的**完整端点参考**，供扩展代理路由时查阅。
> 项目目前只代理了上面「路由总表」中的子集（health / sessions / messages / stream）；其余端点（`/v1/chat/completions`、`/v1/responses`、`/v1/runs`、`/api/jobs` 等）尚未接入。

### 基础约定

- **Base URL**：默认 `http://127.0.0.1:8642`（仅 loopback 绑定）
- **认证**：所有端点强制 Bearer token —— `Authorization: Bearer ${API_SERVER_KEY}`，每个部署（含默认 loopback）**必须**配置，因为该 API 可执行终端命令等完整工具集
- **浏览器直连**：默认**不**开启 CORS；需要时显式设置 allowlist `API_SERVER_CORS_ORIGINS=http://localhost:3000,...`。本文档涉及的 Open WebUI 等前端均为 server-to-server，无需 CORS
- **安全响应头**：所有响应附带 `X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`
- **`model` 字段仅装饰性**：请求里的 `model` 被接受，但实际 LLM 由服务端 `config.yaml` 决定；`/v1/models` 广播的模型名默认取 profile 名（默认 profile 为 `hermes-agent`）

### 一、核心对话端点

#### `POST /v1/chat/completions`

标准 OpenAI Chat Completions 格式。**无状态** —— 每次请求通过 `messages` 数组携带完整对话。

请求：

```json
{
  "model": "hermes-agent",
  "messages": [
    {"role": "system", "content": "You are a Python expert."},
    {"role": "user", "content": "Write a fibonacci function"}
  ],
  "stream": false
}
```

响应：

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "hermes-agent",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "Here's a fibonacci function..."},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 50, "completion_tokens": 200, "total_tokens": 250}
}
```

**内联图片输入**：`user` 消息的 `content` 可为 `text` + `image_url` 数组，支持远程 `http(s)` URL 与 `data:image/...` URL：

```json
{
  "model": "hermes-agent",
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "What is in this image?"},
      {"type": "image_url", "image_url": {"url": "https://example.com/cat.png", "detail": "high"}}
    ]
  }]
}
```

上传文件（`file` / `input_file` / `file_id`）与非图片 `data:` URL 返回 `400 unsupported_content_type`。

**流式**（`"stream": true`）：返回 SSE，逐 token 推送 `chat.completion.chunk` 事件，外加 Hermes 自定义的 `hermes.tool.progress` 事件用于工具启动可见性（不污染已持久化的 assistant 文本）。

#### `POST /v1/responses`

OpenAI Responses API 格式。支持通过 `previous_response_id` 维持**服务端会话状态** —— 服务端存储完整对话历史（含工具调用与结果），多轮上下文无需客户端管理。

请求：

```json
{
  "model": "hermes-agent",
  "input": "What files are in my project?",
  "instructions": "You are a helpful coding assistant.",
  "store": true
}
```

响应：

```json
{
  "id": "resp_abc123",
  "object": "response",
  "status": "completed",
  "model": "hermes-agent",
  "output": [
    {"type": "function_call", "name": "terminal", "arguments": "{\"command\": \"ls\"}", "call_id": "call_1"},
    {"type": "function_call_output", "call_id": "call_1", "output": "README.md src/ tests/"},
    {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Your project has..."}]}
  ],
  "usage": {"input_tokens": 50, "output_tokens": 200, "total_tokens": 250}
}
```

**内联图片输入**：`input[].content` 可含 `input_text` + `input_image`，支持远程 URL 与 `data:image/...`：

```json
{
  "model": "hermes-agent",
  "input": [{
    "role": "user",
    "content": [
      {"type": "input_text", "text": "Describe this screenshot."},
      {"type": "input_image", "image_url": "data:image/png;base64,iVBORw0K..."}
    ]
  }]
}
```

上传文件（`input_file` / `file_id`）与非图片 `data:` URL 返回 `400 unsupported_content_type`。

**流式**（Responses）：使用 OpenAI Responses 原生事件类型 —— `response.created`、`response.output_text.delta`、`response.output_item.added`、`response.output_item.done`、`response.completed`；并在 SSE 流中输出 spec 原生的 `function_call` / `function_call_output` 输出项，便于客户端实时渲染结构化工具 UI。

##### 多轮：`previous_response_id`

链接响应以跨轮保持完整上下文（含工具调用）：

```json
{"input": "Now show me the README", "previous_response_id": "resp_abc123"}
```

服务端从存储的响应链重建完整对话，所有历史工具调用与结果均保留。链式请求共享同一 session，因此多轮对话在 dashboard / 历史中显示为单条记录。

##### 命名会话：`conversation`

用 `conversation` 参数代替手动追踪 response ID：

```json
{"input": "Hello", "conversation": "my-project"}
{"input": "What's in src/?", "conversation": "my-project"}
{"input": "Run the tests", "conversation": "my-project"}
```

服务端自动链接到该 conversation 的最新响应（类似 gateway session 的 `/title` 命令）。

#### `GET /v1/responses/{id}`

按 ID 取回先前存储的响应。

#### `DELETE /v1/responses/{id}`

删除已存储的响应。

### 二、发现与健康检查

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/models` | 将 agent 列为可用模型；模型名默认取 profile 名（默认 profile 为 `hermes-agent`）。大多数前端模型发现所必需 |
| GET | `/v1/capabilities` | 返回 API Server 稳定接口面的机器可读描述，供外部 UI / 编排器 / 插件桥接做能力发现 |
| GET | `/health` | 健康检查，返回 `{"status": "ok"}` |
| GET | `/v1/health` | 同上，面向期望 `/v1/` 前缀的 OpenAI 兼容客户端 |
| GET | `/health/detailed` | 扩展健康检查，额外报告活跃 sessions、运行中的 agents、资源用量 |

`/v1/capabilities` 响应示例：

```json
{
  "object": "hermes.api_server.capabilities",
  "platform": "hermes-agent",
  "model": "hermes-agent",
  "auth": {"type": "bearer", "required": true},
  "features": {
    "chat_completions": true,
    "responses_api": true,
    "run_submission": true,
    "run_status": true,
    "run_events_sse": true,
    "run_stop": true
  }
}
```

### 三、Runs API（流式友好的替代方案）

面向长会话：客户端订阅进度事件，而无需自行管理 streaming。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/runs` | 创建一次 agent run，返回 `run_id` |
| GET | `/v1/runs/{run_id}` | 轮询当前 run 状态（dashboard 免持 SSE 连接） |
| GET | `/v1/runs/{run_id}/events` | SSE 流：工具调用进度、token delta、生命周期事件 |
| POST | `/v1/runs/{run_id}/stop` | 中断运行中的 agent 轮次 |
| POST | `/v1/runs/{run_id}/approval` | 解决等待人工决策的挂起审批，body 携带审批决定 |

`POST /v1/runs` 响应：

```json
{"run_id": "run_abc123", "status": "started"}
```

Runs 接受简单 `input` 字符串，以及可选 `session_id`、`instructions`、`conversation_history`、`previous_response_id`。提供 `session_id` 时，Hermes 会在 run 状态中回显，便于外部 UI 将 run 关联到自身会话 ID。

`GET /v1/runs/{run_id}` 响应：

```json
{
  "object": "hermes.run",
  "run_id": "run_abc123",
  "status": "completed",
  "session_id": "space-session",
  "model": "hermes-agent",
  "output": "Done.",
  "usage": {"input_tokens": 50, "output_tokens": 200, "total_tokens": 250}
}
```

状态在终态（`completed` / `failed` / `cancelled`）后短暂保留，供轮询与 UI 对账。`POST /v1/runs/{run_id}/stop` 立即返回 `{"status": "stopping"}`，Hermes 在下一个安全中断点请求 agent 停止。`/v1/capabilities` 通过 `run_approval` feature 广播审批支持。

### 四、Jobs API（后台调度任务）

轻量 jobs CRUD，用于从远端客户端管理调度 / 后台 agent run。所有端点共享同一 Bearer 认证。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/jobs` | 列出全部已调度 jobs |
| POST | `/api/jobs` | 新建调度 job，body 同 `hermes cron`（prompt、schedule、skills、provider 覆盖、投递目标） |
| GET | `/api/jobs/{job_id}` | 取单个 job 定义与最近运行状态 |
| PATCH | `/api/jobs/{job_id}` | 更新已有 job 字段（prompt、schedule 等），部分更新合并 |
| DELETE | `/api/jobs/{job_id}` | 删除 job，同时取消在途 run |
| POST | `/api/jobs/{job_id}/pause` | 暂停 job（不删除），下次运行时间挂起至恢复 |
| POST | `/api/jobs/{job_id}/resume` | 恢复已暂停的 job |
| POST | `/api/jobs/{job_id}/run` | 立即触发运行（脱离调度） |

### 五、Sessions API（完整 REST 表）

外部 UI 可经 REST 管理 Hermes sessions，无需启动 dashboard。所有端点位于 `/api/sessions/*`，受 `API_SERVER_KEY` 保护。**项目当前只代理了带 ★ 的子集**：

| 方法 | 路径 | 说明 |
|---|---|---|
| ★ GET | `/api/sessions` | 列出 sessions（分页：`limit`、`offset`、`source`、`include_children`） |
| ★ POST | `/api/sessions` | 创建空 session |
| ★ GET | `/api/sessions/{id}` | 读取 session 元数据 |
| ★ PATCH | `/api/sessions/{id}` | 更新 title 或 `end_reason` |
| ★ DELETE | `/api/sessions/{id}` | 删除 session |
| ★ GET | `/api/sessions/{id}/messages` | session 消息历史 |
| POST | `/api/sessions/{id}/fork` | 经 `SessionDB` 血缘分叉（对齐 CLI `/branch` 语义） |
| POST | `/api/sessions/{id}/chat` | 运行一轮同步 agent 对话 |
| ★ POST | `/api/sessions/{id}/chat/stream` | 单轮 SSE 封装 —— 发射 `assistant.delta`、`tool.started`、`tool.completed`、`run.completed` |

> ★ = 项目 `server/api/hermes/**` 已代理（见本文「路由总表」）。`chat/stream` 在项目内映射为终端参数路由 `/api/hermes/stream/:id`。

`/v1/capabilities` 通过 `session_*` feature flag 与 `endpoints.session_*` 条目广播完整接口面。`chat` 与 `chat/stream` payload 支持内联图片（多模态感知路径）。

分叉 + SSE 单轮示例：

```bash
# 分叉 session 并跑一轮
curl -X POST http://localhost:8642/api/sessions/$ID/fork \
  -H "Authorization: Bearer $API_SERVER_KEY" \
  -d '{"title": "explore alt path"}'

# 经 SSE 流式单轮
curl -N -X POST http://localhost:8642/api/sessions/$ID/chat/stream \
  -H "Authorization: Bearer $API_SERVER_KEY" \
  -d '{"input": "what files changed in the last hour?"}'
```

### 六、能力枚举（只读）

让外部客户端经 REST 确定性枚举 agent 能力，而非问模型。两者均只读、受 `API_SERVER_KEY` 保护，并在 `/v1/capabilities` 的 `endpoints.*` 下广播。

```bash
curl http://localhost:8642/v1/skills \
  -H "Authorization: Bearer $API_SERVER_KEY"
# → [{"name": "github-pr-workflow", "description": "...", "category": "..."}, ...]

curl http://localhost:8642/v1/toolsets \
  -H "Authorization: Bearer $API_SERVER_KEY"
# → [{"name": "core", "label": "...", "description": "...", "enabled": true,
#     "configured": true, "tools": ["read_file", "write_file", ...]}, ...]
```

- `/v1/skills` 返回与内部 skills hub 相同的元数据
- `/v1/toolsets` 返回 `api_server` 平台解析的 toolsets 及各自展开的具体 `tools` 列表

### 七、请求头与会话作用域

| Header | 作用 |
|---|---|
| `X-Hermes-Session-Id` | transcript 级 session 标识，在 `/new` 时轮换 |
| `X-Hermes-Session-Key` | **长期记忆作用域**的稳定标识，独立于 `X-Hermes-Session-Id`；可用于 `/v1/chat/completions`、`/v1/responses`、`/v1/runs` |

`X-Hermes-Session-Key` 线程化为 `AIAgent(gateway_session_key=...)`，供 Honcho 等长期记忆 provider 派生稳定作用域。多用户前端（如 Open WebUI）需要与 transcript-scoped ID 解耦的稳定 per-channel 标识时使用。

规则：最长 256 字符；控制字符（`\r`、`\n`、`\x00`）被拒绝；响应（JSON + SSE）回显该值。`/v1/capabilities` 经 `"session_key_header": "X-Hermes-Session-Key"` 广播支持。缺省时，Honcho 的 `per-session` 策略对每个 `session_id` 产生不同作用域（即 Hermes 原先行为）。

```http
POST /v1/chat/completions HTTP/1.1
Authorization: Bearer ***
X-Hermes-Session-Id: transcript-alpha
X-Hermes-Session-Key: agent:main:webui:dm:user-42
```

### 八、系统提示词处理

前端发送 `system` 消息（Chat Completions）或 `instructions` 字段（Responses API）时，hermes-agent 将其**叠加**在自身核心系统提示词之上。agent 仍保留全部工具、记忆、skills —— 前端的系统提示词仅追加额外指令。因此可按前端定制行为而不损失能力。

### 九、配置

#### 环境变量（写入 `~/.hermes/.env`）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `API_SERVER_ENABLED` | `false` | 启用 API Server |
| `API_SERVER_PORT` | `8642` | HTTP 端口 |
| `API_SERVER_HOST` | `127.0.0.1` | 绑定地址（默认仅 localhost） |
| `API_SERVER_KEY` | _(必填)_ | 认证 Bearer token |
| `API_SERVER_CORS_ORIGINS` | _(无)_ | 允许的浏览器来源，逗号分隔 |
| `API_SERVER_MODEL_NAME` | _(profile 名)_ | `/v1/models` 的模型名，默认取 profile 名，默认 profile 为 `hermes-agent` |

> `config.yaml` 暂不支持 API Server 配置 —— 仅用环境变量。

启用 CORS 时：预检响应含 `Access-Control-Max-Age: 600`（10 分钟缓存）；SSE 流式响应含 CORS 头以支持浏览器 EventSource；`Idempotency-Key` 为允许的请求头（响应按键缓存 5 分钟用于去重）。

#### 多用户：Profiles

每个用户独立 Hermes 实例（独立 config、记忆、skills）用 profile 实现 —— 各 profile 写入自身 `.env` 配置不同 `API_SERVER_PORT` / `API_SERVER_KEY`，再分别 `hermes -p <name> gateway &` 启动。每个 profile 的 API Server 自动以 profile 名作为模型 ID 广播。

### 十、限制

- **响应存储** —— 为 `previous_response_id` 存储的响应持久化于 SQLite，gateway 重启后存活。最多 100 条（LRU 淘汰）
- **无文件上传** —— `/v1/chat/completions` 与 `/v1/responses` 均支持内联图片，但上传文件（`file`、`input_file`、`file_id`）与非图片文档输入经 API 不支持
- **`model` 字段仅装饰性** —— 见「基础约定」

### 附：代理模式（Proxy Mode）

API Server 也可作为 **gateway proxy mode** 的后端。当另一个 Hermes gateway 实例配置 `GATEWAY_PROXY_URL` 指向本 API Server 时，它将所有消息转发至此，而非运行自身 agent —— 用于拆分部署（例如 Docker 容器处理 Matrix E2EE 后中继到主机侧 agent）。
