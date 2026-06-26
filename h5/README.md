# Hermes · Liquid Glass (h5)

一个基于 **Nuxt 3** 的 Hermes Agent API Server 客户端，采用全局 **iOS 26 · Liquid Glass** 设计风格。

功能：

- **会话历史** — 分页浏览所有 Hermes 会话，显示标题、时间、来源、消息数
- **新增会话** — 一键创建空会话并进入对话
- **会话详情对话** — 加载历史消息，发送消息并通过 SSE 流式渲染 agent 回复（含工具调用进度）
- **会话管理** — 重命名 / 删除

## 1. 前置条件

启动 Hermes gateway API server（在 `~/.hermes/.env` 中配置）：

```ini
API_SERVER_ENABLED=true
API_SERVER_KEY=change-me-local-dev
# 如需浏览器直连再开 CORS；本项目默认走 Nuxt 服务端代理，无需 CORS
```

启动后应看到：

```
[API Server] API server listening on http://127.0.0.1:8642
```

## 2. 安装

```bash
cd h5
cp .env.example .env      # 按需修改 HERMES_API_KEY
npm install
```

## 3. 开发

```bash
npm run dev               # http://localhost:3111
```

## 4. 生产

```bash
npm run build && node .output/server/index.mjs
```

## 架构说明

本项目通过 **Nuxt server routes** 代理所有 Hermes 请求（`server/api/hermes/**`），
这样：

1. API Key 仅保存在服务端（`runtimeConfig.hermesApiKey`），不会泄露到浏览器；
2. 无需为 Hermes 开启 CORS。

主要对接 Hermes 的 **Sessions API**（`/api/sessions/*`）——它原生支持持久化会话、
消息历史与 SSE 流式对话，正好对应「会话历史 / 新增会话 / 会话详情对话」三项需求：

| 功能 | Hermes 端点 | 代理路由 |
| --- | --- | --- |
| 会话列表 | `GET /api/sessions` | `GET /api/hermes/sessions` |
| 新建会话 | `POST /api/sessions` | `POST /api/hermes/sessions` |
| 会话详情 | `GET /api/sessions/{id}` | `GET /api/hermes/sessions/:id` |
| 消息历史 | `GET /api/sessions/{id}/messages` | `GET /api/hermes/sessions/:id/messages` |
| 流式对话 | `POST /api/sessions/{id}/chat/stream` | `POST /api/hermes/stream/:id` |
| 重命名 | `PATCH /api/sessions/{id}` | `PATCH /api/hermes/sessions/:id` |
| 删除 | `DELETE /api/sessions/{id}` | `DELETE /api/hermes/sessions/:id` |

> 也可改用无状态的 `POST /v1/chat/completions`（OpenAI 兼容），但会话历史需要自行存储，
> 故持久化会话场景优先使用 Sessions API。

## 配置项（环境变量）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HERMES_BASE_URL` | `http://127.0.0.1:8642` | Hermes API server 地址 |
| `HERMES_API_KEY` | `change-me-local-dev` | Bearer token，需与 `API_SERVER_KEY` 一致 |
