# 编码规范与扩展指南

通用规则见用户全局 `~/.claude/rules/ecc/`。本文只讲**本项目特有**的约定与「如何新增 X」。

## 组件（`components/`，自动导入）

- **命名**：PascalCase，语义化（`SessionCard`，不是 `Card2`）。
- **职责**：纯展示 + 自身交互。**不直接 `$fetch`**——数据来自 props 或 composable。
- **Props**：用 `defineProps<{ ... }>()` 显式类型；`withDefaults` 给默认值。回调用 `defineEmits<{ name: [args] }>()`。
- **样式**：`<style scoped>`；需要穿透子组件根用 `:deep()`；markdown 渲染的 `v-html` 内容用**非 scoped** 的全局样式块（见 `MessageBubble.vue` 第二个 `<style>`）。
- **图标**：不要引图标库。加到 `GlassIcon.vue` 的 `ICONS` map，用 `<GlassIcon name="xxx" :size="18" />`。

新增组件清单（参考现有）：
| 想做的 | 参照 |
|---|---|
| 玻璃容器/卡片 | `.glass` 类 + `SessionCard.vue` |
| 按钮 | `.glass-btn` / `.glass-btn--primary` / `--icon` / `--danger` |
| 输入 | `.glass-input` / `ComposeBar.vue`（自动增高 textarea） |
| 弹窗 | `PromptDialog.vue`（Teleport + Transition） |
| 列表项 | `SessionCard.vue`（hover 显操作、移动端常显） |

## Composable（`composables/`，自动导入）

- **命名**：`use` 前缀 + camelCase。
- **共享状态**：用 `useState('ns:key', () => init)`，**在函数体内调用**（禁模块顶层）。
- **不可变**：返回新数组/对象，禁止 `push`/原地改（便于响应式与调试）。
- **错误**：向上抛（`throw`）或经 `useToast` 提示；**不要 `console.log`**。
- **唯一数据出口**：`useHermes` 是访问 `/api/hermes/**` 的唯一入口；业务 composable（`useSessions`/`useChat`）基于它编排。

模板里访问 `useChat()` 返回的嵌套 ref **必须用 `.value`**（不会自动解包）：
```vue
<div v-for="m in chat.messages.value">     <!-- ✓ -->
```
而 `useSessions()` 解构出来的顶层 ref 在模板里自动解包：
```vue
<div v-if="loading">                        <!-- ✓ loading 已解包 -->
```

## Server 路由（`server/api/hermes/`）

- **复用 `hermesFetch`**（`server/utils/hermes.ts`，自动导入）：注入 Key、超时、错误归一。
- **校验在边界**：`getRouterParam` / `readBody` 后立即校验，非法 `throw createError({statusCode:400})`。
- **GET 参数**：用 `getQuery(event)` 取，转成 `hermesFetch` 的 `query`。
- **方法后缀**：文件名 `.get/.post/.patch/.delete.ts`。注意**带 body 的动态路由让参数位于路径末尾**（见约束 #1）。
- **流式**：照抄 `stream/[id].post.ts`——用 `sendWebResponse(event, upstream)`，不要手动 pipe。

新增只读代理路由示例：
```ts
// server/api/hermes/skills.get.ts
export default defineEventHandler((event) => {
  return hermesFetch({ event, path: '/v1/skills' })
})
```

## 样式（`assets/css/`）

**改视觉先改 `tokens.css`**（颜色/圆角/阴影/动效/字体都是 CSS 变量）。禁止硬编码这些值。

- **新玻璃元素**：套 `.glass` / `.glass--strong` / `.glass--subtle`，不要重写 `backdrop-filter`。
  需要交互悬浮加 `.glass--interactive`。
- **颜色**：用 `var(--accent-1/2/3)` 或 `var(--text-primary/secondary/tertiary)`。
  语义色（成功/危险）用 `oklch(...)` 内联在对应组件（参考 `ToolIndicator.vue`）。
- **动效**：`var(--ease-spring)`（弹）/ `var(--ease-out-expo)`（出）；时长 `var(--dur-fast/normal/slow)`。
  动画类在 `animations.css`（`.anim-*`、`.stagger`、`.typing-dots`...）。
- **光暗主题**：token 已用 `prefers-color-scheme` + `[data-theme]` 处理；写组件时只用变量，不要写死明暗。
- **可访问性**：`:focus-visible` 已全局有焦点环；`prefers-reduced-motion` 已全局降级。
- 动画只用合成友好属性（`transform`/`opacity`/`clip-path`/`filter`），避免动 `width/height/top/left`。

## 类型（`types/hermes.ts`）

- 上游模型保留 `[key: string]: unknown` index signature，容忍 Hermes 加字段。
- 对外函数显式标注参数与返回类型；局部变量让 TS 推断。
- 新增字段：先在 type 加可选属性，渲染处用「字段存在再显示」防御（参考 `SessionCard.vue`）。

## 文件组织

- 按功能聚合，单文件 < 800 行（超了就拆）。
- 页面放 `pages/`，可复用 UI 放 `components/`，逻辑放 `composables/`，上游模型放 `types/`。
- 命名清晰胜过注释；复杂逻辑补 `// 为什么` 注释（不是「是什么」）。

## 提交前自检

- [ ] 无 `console.*` / `debugger`
- [ ] 错误用 `useToast` 或 `createError`，不静默吞
- [ ] 新增上游字段已加到 type 且渲染处有兜底
- [ ] 流式相关改动后跑 CLAUDE.md 的「验证清单」
- [ ] `npm run build` 通过
