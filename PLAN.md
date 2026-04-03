# CODE-CLAW 进化计划 v2

> 目标：把 claw-code 从"桌面编程助手"进化成"24小时在线的个人AI助手（小龙虾）"
> 核心理念：吸收 OpenClaw 的灵魂/记忆/消息平台能力，保持 claw-code 的架构主体不变
> 最后更新：2026-04-03

---

## 零、项目介绍

### 什么是 claw-code

claw-code 是一个**本地部署的桌面 AI 编程助手**，类似 Claude Code / Cursor / Windsurf，但完全自主可控：
- 不绑定任何单一模型供应商（支持 DeepSeek、Kimi、通义千问、豆包、智谱、Gemini、OpenAI 等）
- 本地运行，数据不出本机
- 支持代码生成、审核、工具调用、文件编辑
- 有完整的桌面 GUI（Electron）

### 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 前端 UI | React 18 + TypeScript + Vite + Tailwind | `ai-code-studio/` 目录 |
| 桌面壳 | Electron | `desktop/main.mjs` + `desktop/preload.cjs` |
| 后端服务 | 原生 Node.js HTTP | `tools/claw-launcher-ui/server.mjs`，端口 8891 |
| 模型网关 | 原生 Node.js HTTP | `tools/model-gateway/server.mjs`，端口 8787 |
| AI 运行时 | Rust 编译的 `claw.exe` | `claw-code/rust/target/release/claw.exe` |
| 通信 | HTTP + SSE（Server-Sent Events）| 前端通过 SSE 实时接收状态更新 |

### 已完成的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| Electron 桌面壳 | ✅ | 双击即可运行，支持打包 |
| 首启向导 | ✅ | 引导用户配置 API key、模型、工作目录 |
| 多模型网关 | ✅ | 支持 OpenAI/Anthropic/Gemini 三种协议适配 |
| 安全存储 API key | ✅ | 使用系统密钥链 |
| 多会话管理 | ✅ | 创建/切换/搜索/重命名/删除会话 |
| 聊天界面 | ✅ | 用户/助手消息、标签页（聊天/协作/代码） |
| 工具调用 | ✅ | 通过 claw.exe 执行代码工具 |
| 高风险审批 | ✅ | 危险操作需要用户确认 |
| 运行队列 | ✅ | 多个请求自动排队 |
| 持久 REPL | ✅ | 长驻 claw.exe 进程，多轮对话共享上下文 |
| 诊断面板 | ✅ | 系统状态检查 + 导出诊断报告 |
| 独立设置页 | ✅ | 模型配置、工作目录、权限模式 |
| 桌面菜单/关于页 | ✅ | 版本信息、菜单栏 |
| Windows 便携版打包 | ✅ | `dist/electron-builder/claw-code-0.1.0-x64.exe` |
| 烟测脚本 | ✅ | `npm run ai-code-studio:smoke` |
| Skill 文件 | ✅ | 7 个 skill 在 `.claude/commands/`（但 server.mjs 还没加载器） |
| 会话改名 | ✅ | 点击标题编辑，回车保存 |
| 会话删除 | ✅ | 悬停显示垃圾桶，自定义确认弹窗 |

### 已知问题（R0 级别，发布阻塞）

| 问题 | 严重程度 | 涉及文件 |
|------|---------|---------|
| 聊天顺序可能错乱 | 高 | server.mjs, helpers.ts |
| 默认聊天视图混入运行事件 | 中 | ConversationPane.tsx |
| 发送反馈不够即时（缺乐观更新）| 中 | App.tsx, ConversationPane.tsx |
| 会话恢复过于激进 | 中 | server.mjs |
| 助手身份可能被旧上下文污染 | 中 | server.mjs, model-gateway |

> 这些 R0 问题在 HANDOFF_TASKBOOK.md 中有详细描述。
> 进化计划和 R0 修复可以并行推进，但 R0 修复优先级更高。

### 项目目录结构

```
F:\CODE-CLAW/
├── ai-code-studio/          # React 前端
│   ├── src/
│   │   ├── App.tsx           # 主入口（状态管理、API 调用）
│   │   ├── app/
│   │   │   ├── types.ts      # 所有 TypeScript 类型定义
│   │   │   ├── helpers.ts    # 工具函数
│   │   │   └── providerPresets.ts  # 预设模型服务商
│   │   ├── components/
│   │   │   ├── ConversationPane.tsx  # 聊天主界面
│   │   │   ├── SetupSidebar.tsx      # 左侧会话栏
│   │   │   ├── SettingsDialog.tsx    # 设置弹窗
│   │   │   ├── SetupWizard.tsx       # 首启向导
│   │   │   ├── DiagnosticsPanel.tsx  # 诊断面板
│   │   │   ├── ToolWorkbenchPanel.tsx # 工具工作台
│   │   │   └── AboutDialog.tsx       # 关于页
│   │   └── buddy/             # 伙伴精灵（turtle）
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── claw-code/                # AI 运行时（Python + Rust）
│   ├── src/                   # Python 源码
│   ├── rust/                  # Rust 源码
│   │   └── target/release/claw.exe  # 编译产物
│   └── .claude/               # claw-code 自身配置
│
├── desktop/                  # Electron 桌面壳
│   ├── main.mjs               # 主进程
│   └── preload.cjs            # preload 桥
│
├── tools/                    # 服务工具
│   ├── claw-launcher-ui/      # 核心后端服务
│   │   ├── server.mjs         # ⭐ 主逻辑（3349行）
│   │   └── data/              # 运行时数据（会话、配置）
│   ├── model-gateway/         # 模型协议网关
│   │   └── server.mjs         # 协议适配（889行）
│   ├── feishu-bridge/         # 🆕 飞书适配器（Part 3 新建）
│   └── mock-openai/           # 模拟服务（测试用）
│
├── scripts/                  # 脚本
│   └── smoke-claw-code-desktop.mjs  # 烟测
│
├── shareable-codex-skills/   # 12 个可共享技能模块
├── compatible-shell/         # 兼容性 Shell
├── assets/                   # 图片资源
│
├── .claude/                  # Claude 配置
│   └── commands/              # 7 个 Skill 文件
│
├── package.json              # 工作空间根配置
├── electron-builder.yml      # Electron 打包配置
├── HANDOFF_TASKBOOK.md       # R0 问题交接文档
├── DELIVERY.md               # 交付文档
└── PLAN.md                   # 本文件（进化计划）
```

### 验证命令

```bash
# 前端类型检查
npm --prefix ai-code-studio run lint

# 前端构建
npm --prefix ai-code-studio run build

# 后端语法检查
node --check tools/claw-launcher-ui/server.mjs
node --check tools/model-gateway/server.mjs

# 烟测
npm run ai-code-studio:smoke

# 打包
npm run ai-code-studio:dist

# 启动桌面应用（开发模式）
npm run ai-code-studio:desktop
```

### 用户偏好

- **所有交流必须用中文**
- 代码注释可以用英文
- 产品名保持 `claw-code`，不要改
- 不要推翻现有架构，在现有代码上扩展
- 修改 CSS/组件时触发对应 Skill（brand-guidelines、frontend-design 等）
- Git 身份：`Work-Fisher` / `your-email@example.com`

---

## 一、当前架构总览

### 项目位置
- 工作目录：`F:\CODE-CLAW`
- 原始开发目录：`C:\Users\Administrator\Documents\Playground\py2`（已完整复制到 F 盘）

### 核心文件清单

| 文件 | 作用 | 行数 |
|------|------|------|
| `tools/claw-launcher-ui/server.mjs` | 后端主逻辑：HTTP 服务、会话管理、运行调度、SSE 推送 | ~3349 行 |
| `tools/model-gateway/server.mjs` | 模型网关：Anthropic→OpenAI/Gemini 协议适配 | ~889 行 |
| `ai-code-studio/src/App.tsx` | 前端主入口：状态管理、API 调用、组件组装 | ~620 行 |
| `ai-code-studio/src/components/ConversationPane.tsx` | 聊天主界面：消息展示、输入框、标签页 | ~500 行 |
| `ai-code-studio/src/components/SetupSidebar.tsx` | 左侧栏：会话列表、搜索、新建、删除 | ~216 行 |
| `ai-code-studio/src/app/helpers.ts` | 工具函数：消息排序、格式化、状态标签 | — |
| `ai-code-studio/src/app/types.ts` | TypeScript 类型定义 | — |
| `desktop/main.mjs` | Electron 主进程 | ~12KB |
| `desktop/preload.cjs` | Electron preload 桥 | ~1KB |
| `claw-code/rust/target/release/claw.exe` | Rust 运行时二进制 | — |

### 数据存储

| 文件 | 位置 | 内容 |
|------|------|------|
| `app-sessions.json` | `tools/claw-launcher-ui/data/` | 所有会话（transcript + toolCalls + timeline） |
| `settings.json` | `tools/claw-launcher-ui/data/` | UI 配置（API key、模型、工作目录等） |
| `runtime-state.json` | `tools/claw-launcher-ui/data/` | 运行时队列和待审批请求 |

### 通信架构

```
前端 (ai-code-studio, localhost:5173 开发 / Electron 生产)
  ↕ HTTP + SSE (localhost:8891)
server.mjs (claw-launcher-ui)
  ↕ spawn 进程
  claw.exe (Rust REPL 或单次 prompt)
  ↕ fetch (localhost:8787)
model-gateway
  ↕ fetch
上游 LLM API (DeepSeek/Kimi/Qwen/OpenAI/Gemini...)
```

### 关键生命周期

```
用户发消息 → POST /api/chat → startClawPrompt()
  → 检查是否高风险 → 队列/审批/直接执行
  → executeRunRequest() → spawn claw.exe 或写入持久 REPL stdin
  → 监听 stdout → 实时 SSE 推送 transcript/timeline/toolCalls
  → 进程结束 → finalizeClawRun() 或 finalizePersistentHostTurn()
  → 保存会话 → 广播最终状态 → pumpRunQueue() 处理下一个
```

### 已有的 Skill 系统

7 个 skill 文件在 `.claude/commands/` 下：
- brand-guidelines.md、canvas-design.md、composition-patterns.md
- frontend-design.md、react-best-practices.md、theme-factory.md、web-design-guidelines.md

**注意**：这些 skill 目前只有 Claude Code CLI 能识别。claw-code 的 server.mjs 还没有 skill 加载/注入逻辑。

---

## 二、进化计划（5 个 Part）

---

### Part 1：灵魂注入（SOUL 系统）

**目标**：让 claw-code 有固定的人格、价值观、行为边界，不再是"通用 AI 回复机器"

#### 1.1 创建 SOUL.md 模板

**位置**：`{workspaceDir}/.claw/SOUL.md`

**完整模板内容**（中文版，面向 code-claw 产品）：

```markdown
# SOUL

## 我是谁

我是小龙虾（Code-Claw），你的个人 AI 助手。我运行在你的本地设备上，
通过飞书、桌面应用等渠道随时待命。我的记忆跨会话持久保存，
我会随着和你的互动不断进化。

## 核心原则

- **真实有用**：跳过客套话，直接解决问题。不说"好的，我来帮你"，直接做。
- **有自己的判断**：对技术方案有明确偏好和意见，不当复读机。
- **独立解决**：能自己搞定的不问用户，卡住了才请示。
- **记住一切**：用户说过的偏好、项目背景、做过的决策，我都记在 Memory 里。

## 行为边界

- **隐私绝对保护**：不泄露用户数据，不把对话内容发到任何外部服务。
- **外部操作先请示**：发消息、删文件、推代码之前，先确认。
- **不冒充用户**：在群聊中不代替用户发言。
- **不急躁**：消息平台的回复不需要即时，可以深思熟虑再回答。

## 风格

真正有用的助手——不卑不亢，不是企业客服也不是谄媚的聊天机器人。
简单问题简短回答，复杂问题给出深度分析。
默认中文，用户用英文时切英文。

## 持续进化

- 这个文件就是我的"灵魂"，跨会话持久存在
- 用户可以随时修改这个文件来调整我的行为
- Memory 系统记录我学到的一切
- 我会在 SOUL.md 中标注需要用户确认的自我更新建议
```

#### 1.2 server.mjs 改造

**改动位置**：`tools/claw-launcher-ui/server.mjs`

**需要加的代码逻辑**：

```javascript
// === SOUL 系统 ===

// 1. 读取 SOUL.md
function loadSoul(workspaceDir) {
  const soulPath = join(workspaceDir, '.claw', 'SOUL.md');
  try {
    return readFileSync(soulPath, 'utf-8');
  } catch {
    // 首次运行，创建默认模板
    mkdirSync(join(workspaceDir, '.claw'), { recursive: true });
    writeFileSync(soulPath, DEFAULT_SOUL_TEMPLATE, 'utf-8');
    return DEFAULT_SOUL_TEMPLATE;
  }
}

// 2. 文件监听热重载
let cachedSoul = '';
function watchSoul(workspaceDir) {
  const soulPath = join(workspaceDir, '.claw', 'SOUL.md');
  cachedSoul = loadSoul(workspaceDir);
  try {
    watchFile(soulPath, { interval: 2000 }, () => {
      try {
        cachedSoul = readFileSync(soulPath, 'utf-8');
        pushLog('ui', 'SOUL.md 已重新加载');
      } catch { /* 文件被删除时忽略 */ }
    });
  } catch { /* watch 失败时用缓存 */ }
}

// 3. 注入到 prompt
// 在 buildPromptWithCarryOver() 或 executeRunRequest() 中：
// 把 cachedSoul 作为 system prompt 前缀拼接
```

**具体注入点**：

找到 `executeRunRequest()` 函数（约第 2732 行），在构建运行参数时：

```javascript
// 原来：直接把 prompt 传给 claw.exe
// 改为：在 prompt 前面拼接 SOUL + MEMORY 上下文

const soulPrefix = cachedSoul
  ? `<soul>\n${cachedSoul}\n</soul>\n\n`
  : '';
const memoryPrefix = cachedMemory
  ? `<memory>\n${cachedMemory}\n</memory>\n\n`
  : '';
const enrichedPrompt = soulPrefix + memoryPrefix + originalPrompt;
```

**注意**：如果走持久 REPL 模式（`executePersistentHostTurn`），SOUL 需要在 REPL 启动时就注入一次（作为 system prompt），后续每轮不重复注入。

#### 1.3 新增 API 端点

```
GET  /api/soul          → 返回当前 SOUL.md 内容
POST /api/soul          → { content: string } → 保存 SOUL.md
```

前端可在设置页加一个"灵魂编辑器"入口。

#### 1.4 验证标准

- 新建会话，发"你是谁" → 回复应体现 SOUL.md 中定义的人格
- 修改 SOUL.md 中的风格描述 → 下一条消息立即反映变化
- 删除 SOUL.md → 自动重建默认模板

---

### Part 2：持久记忆（Memory 系统）

**目标**：跨会话记住用户偏好、项目上下文、重要决策

#### 2.1 目录结构

```
{workspaceDir}/.claw/memory/
  MEMORY.md              — 长期记忆索引（≤200 行，≤25KB）
  .last-dream            — 上次 autoDream 时间戳
  .dream-lock            — autoDream 锁文件
  logs/
    2026-04-03.md        — 每日交互日志
    2026-04-04.md
  topics/
    user-preferences.md  — 用户偏好
    project-context.md   — 项目背景
    tech-decisions.md    — 技术决策
    ...
```

#### 2.2 MEMORY.md 格式

```markdown
# Memory Index

- [用户偏好](topics/user-preferences.md) — 用中文交流、喜欢简洁回复
- [项目背景](topics/project-context.md) — claw-code 桌面产品，Electron + React + Rust
- [技术决策](topics/tech-decisions.md) — 用 DeepSeek 作为主力模型
```

#### 2.3 每日日志格式

```markdown
# 2026-04-03

## 会话 session-xxx (10:30)
- 用户讨论了飞书适配器的实现方案
- 决定以 claw-code 为主体吸收 OpenClaw 功能
- 用户偏好：先做 SOUL + Memory + 飞书

## 会话 session-yyy (14:20)
- 修复了删除弹窗样式
- 添加了会话改名功能（点击标题编辑）
```

#### 2.4 server.mjs 改造

**需要加的函数**：

```javascript
// === Memory 系统 ===

const MEMORY_DIR = '.claw/memory';
const MEMORY_INDEX = 'MEMORY.md';
const LOGS_DIR = 'logs';
const TOPICS_DIR = 'topics';

// 1. 初始化 memory 目录
function initMemory(workspaceDir) {
  const memDir = join(workspaceDir, MEMORY_DIR);
  mkdirSync(join(memDir, LOGS_DIR), { recursive: true });
  mkdirSync(join(memDir, TOPICS_DIR), { recursive: true });
  const indexPath = join(memDir, MEMORY_INDEX);
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, '# Memory Index\n\n（暂无记忆）\n', 'utf-8');
  }
}

// 2. 读取 Memory 上下文（每次对话开始时调用）
function loadMemoryContext(workspaceDir) {
  const memDir = join(workspaceDir, MEMORY_DIR);
  let context = '';

  // 读索引
  try {
    const index = readFileSync(join(memDir, MEMORY_INDEX), 'utf-8');
    context += `## 长期记忆\n${index}\n\n`;
  } catch {}

  // 读今天和昨天的日志
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const date of [yesterday, today]) {
    try {
      const log = readFileSync(join(memDir, LOGS_DIR, `${date}.md`), 'utf-8');
      context += `## 日志 ${date}\n${log}\n\n`;
    } catch {}
  }

  return context;
}

// 3. 追加日志（对话结束时调用）
function appendDailyLog(workspaceDir, sessionId, summary) {
  const memDir = join(workspaceDir, MEMORY_DIR);
  const today = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5);
  const logPath = join(memDir, LOGS_DIR, `${today}.md`);

  const header = existsSync(logPath) ? '' : `# ${today}\n\n`;
  const entry = `## 会话 ${sessionId} (${time})\n${summary}\n\n`;
  appendFileSync(logPath, header + entry, 'utf-8');
}

// 4. 保存主题记忆（LLM 或用户手动触发）
function saveTopicMemory(workspaceDir, topic, content) {
  const topicPath = join(workspaceDir, MEMORY_DIR, TOPICS_DIR, `${topic}.md`);
  writeFileSync(topicPath, content, 'utf-8');
  // TODO: 同步更新 MEMORY.md 索引
}
```

**注入时机**（在 `executeRunRequest()` 中）：

```javascript
// 在构建 prompt 时，按顺序注入：
// 1. SOUL（人格）
// 2. MEMORY（长期记忆 + 当日日志）
// 3. 用户消息

const soul = cachedSoul ? `<soul>\n${cachedSoul}\n</soul>\n\n` : '';
const memory = loadMemoryContext(workspaceDir);
const memoryBlock = memory ? `<memory>\n${memory}\n</memory>\n\n` : '';
const enrichedPrompt = soul + memoryBlock + originalPrompt;
```

**对话结束时自动记录**：

在 `finalizeClawRun()` 和 `finalizePersistentHostTurn()` 的末尾：

```javascript
// 从 transcript 中提取最后几条消息，生成摘要
const lastMessages = transcript.slice(-6);
const summary = lastMessages
  .filter(m => m.role === 'user' || m.role === 'assistant')
  .map(m => `- ${m.role === 'user' ? '用户' : 'AI'}：${m.content?.slice(0, 100)}`)
  .join('\n');
appendDailyLog(workspaceDir, sessionId, summary);
```

#### 2.5 新增 API 端点

```
GET  /api/memory                → 返回 MEMORY.md + 最近日志
POST /api/memory/save           → { topic, content } → 保存主题记忆
GET  /api/memory/logs/:date     → 返回指定日期的日志
POST /api/memory/search         → { query } → 搜索记忆（后期加向量搜索）
```

#### 2.6 前端改动

在 SetupSidebar.tsx 或 SettingsDialog.tsx 里加一个"记忆"入口：
- 显示 MEMORY.md 内容
- 可编辑
- 可查看最近日志

#### 2.7 验证标准

- 告诉 AI "我喜欢用 DeepSeek" → 结束会话 → 新建会话问"我常用什么模型" → 能回忆起来
- 检查 `.claw/memory/logs/` 下有当日日志
- 检查 MEMORY.md 被更新

---

### Part 3：飞书适配器

**目标**：通过飞书消息和 AI 对话，手机随时随地可用，实现 24 小时在线

#### 3.1 架构

```
用户手机飞书
  ↕ HTTPS (飞书开放平台)
飞书 webhook → 你的服务器公网地址（或内网穿透）
  ↕ HTTP
feishu-bridge/server.mjs (localhost:8892)
  ↕ HTTP
claw-launcher-ui/server.mjs (localhost:8891) → /api/chat
  ↕
model-gateway (localhost:8787) → 上游 LLM
```

#### 3.2 飞书开放平台配置（用户手动操作）

1. 登录 https://open.feishu.cn/
2. 创建企业自建应用
3. 开启"机器人"能力
4. 获取 App ID 和 App Secret
5. 配置事件订阅 URL：`https://你的公网地址:8892/webhook/feishu`
   - 订阅事件：`im.message.receive_v1`（接收消息）
6. 配置权限：`im:message:send_as_bot`（发送消息）

#### 3.3 新建 `tools/feishu-bridge/server.mjs`

```javascript
// 飞书适配器完整结构

import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

const CONFIG = {
  port: parseInt(process.env.FEISHU_PORT || '8892'),
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN || '',
  encryptKey: process.env.FEISHU_ENCRYPT_KEY || '',
  clawApiUrl: process.env.CLAW_API_URL || 'http://127.0.0.1:8891',
};

// --- 飞书 API ---

// 获取 tenant_access_token
async function getTenantToken() {
  const resp = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: CONFIG.appId,
      app_secret: CONFIG.appSecret,
    }),
  });
  const data = await resp.json();
  return data.tenant_access_token;
}

// 发送消息到飞书
async function sendFeishuMessage(chatId, content) {
  const token = await getTenantToken();
  await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    }),
  });
}

// --- Webhook 处理 ---

async function handleFeishuWebhook(body) {
  // 1. URL 验证（首次配置时飞书会发 challenge）
  if (body.type === 'url_verification') {
    return { challenge: body.challenge };
  }

  // 2. 消息事件
  if (body.header?.event_type === 'im.message.receive_v1') {
    const event = body.event;
    const msgType = event.message?.message_type;
    const chatId = event.message?.chat_id;
    const content = JSON.parse(event.message?.content || '{}');

    if (msgType === 'text' && chatId) {
      const userText = content.text || '';

      // 转发到 claw-code
      try {
        await fetch(`${CONFIG.clawApiUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: userText,
            replyCallback: {
              type: 'feishu',
              chatId: chatId,
            },
          }),
        });
      } catch (err) {
        await sendFeishuMessage(chatId, `[错误] 无法连接到 AI 服务：${err.message}`);
      }
    }
  }

  return { ok: true };
}

// --- HTTP 服务 ---

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/webhook/feishu') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const result = await handleFeishuWebhook(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, service: 'feishu-bridge' }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`[feishu-bridge] 监听端口 ${CONFIG.port}`);
});
```

#### 3.4 server.mjs 改造（回调支持）

在 `finalizeClawRun()` 末尾加回调逻辑：

```javascript
// 如果请求带有 replyCallback，把结果推回消息平台
if (context.replyCallback) {
  const { type, chatId } = context.replyCallback;
  const assistantMessage = /* 从 transcript 取最后一条 assistant 消息 */;

  if (type === 'feishu') {
    // 调飞书 bridge 的发送 API
    try {
      await fetch(`http://127.0.0.1:8892/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, content: assistantMessage }),
      });
    } catch (err) {
      pushLog('error', `飞书回调失败：${err.message}`);
    }
  }
}
```

同时 `startClawPrompt()` 的请求体需要支持 `replyCallback` 字段透传。

#### 3.5 常驻运行

当前 server.mjs 依赖 Electron 窗口。要 24 小时在线需要：

**方案 A（简单）**：用 PM2 独立启动 server.mjs
```bash
pm2 start tools/claw-launcher-ui/server.mjs --name claw-server
pm2 start tools/feishu-bridge/server.mjs --name feishu-bridge
pm2 start tools/model-gateway/server.mjs --name model-gateway
pm2 save
pm2 startup  # 开机自启
```

**方案 B（Windows 服务）**：用 node-windows 注册为系统服务

**方案 C（Docker）**：三个服务打包成 docker-compose

建议先用方案 A，最简单。

#### 3.6 内网穿透

飞书 webhook 需要公网可访问的 URL。如果服务跑在本地电脑：

**选项 1**：ngrok
```bash
ngrok http 8892
# 得到 https://xxx.ngrok.io → 填入飞书事件订阅 URL
```

**选项 2**：Tailscale Funnel（免费）
```bash
tailscale serve --bg 8892
tailscale funnel 443
```

**选项 3**：腾讯云服务器部署（推荐生产用）
- 轻量应用服务器 2 核 4G，50-80 元/月
- 直接用 IP 地址，不需要域名备案
- PM2 托管三个服务

#### 3.7 验证标准

- 飞书发"你好" → 收到 AI 回复
- 飞书发"帮我分析一下这段代码" → 收到代码分析结果
- 关闭 Electron 窗口 → 飞书仍能收到回复（常驻模式）

---

### Part 4：MagicDocs 自动文档

**目标**：标记为 `# MAGIC DOC:` 的文件，每次对话结束后自动更新

#### 4.1 文件检测

```javascript
// 递归扫描 workspaceDir 下的 .md 文件
function scanMagicDocs(workspaceDir) {
  const MAGIC_DOC_RE = /^#\s*MAGIC\s+DOC:\s*(.+)$/im;
  const INSTRUCTION_RE = /^\s*\n(?:\s*\n)?[_*](.+?)[_*]\s*$/m;
  const results = [];

  function walk(dir, depth) {
    if (depth > 3) return; // 限制深度
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const match = content.match(MAGIC_DOC_RE);
          if (match) {
            const title = match[1].trim();
            const afterHeader = content.slice(match.index + match[0].length);
            const instrMatch = afterHeader.match(INSTRUCTION_RE);
            results.push({
              path: fullPath,
              title,
              instructions: instrMatch?.[1]?.trim(),
            });
          }
        } catch {}
      }
    }
  }

  walk(workspaceDir, 0);
  return results;
}
```

#### 4.2 更新逻辑

```javascript
const magicDocThrottle = new Map(); // path → lastUpdated timestamp

async function updateMagicDoc(doc, transcript, config) {
  // 节流：同一文件 10 分钟内不重复更新
  const lastUpdated = magicDocThrottle.get(doc.path) || 0;
  if (Date.now() - lastUpdated < 10 * 60 * 1000) return;

  // 读取当前文件
  const currentContent = readFileSync(doc.path, 'utf-8');

  // 构建更新 prompt
  const recentConversation = transcript
    .slice(-10)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role}: ${m.content?.slice(0, 500)}`)
    .join('\n');

  const prompt = `
你需要更新一个自动维护的文档。根据最近的对话内容，更新文档中的过时信息，添加新学到的内容。

当前文档内容：
<current_doc>
${currentContent}
</current_doc>

文档标题：${doc.title}
${doc.instructions ? `自定义更新指令：${doc.instructions}` : ''}

最近对话：
<conversation>
${recentConversation}
</conversation>

规则：
- 保留文档头 "# MAGIC DOC: ${doc.title}" 不变
- 只更新有实质新信息的部分
- 删除过时内容
- 保持简洁，高信息密度
- 如果没有需要更新的内容，原样返回

直接返回更新后的完整文档内容，不要加任何解释。
`;

  // 调 model-gateway
  const gatewayUrl = `http://127.0.0.1:${config.gatewayPort}/v1/messages`;
  const response = await fetch(gatewayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.upstreamApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.upstreamModel,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) return;

  const result = await response.json();
  const newContent = result.content?.[0]?.text;

  if (newContent && newContent.includes('MAGIC DOC')) {
    writeFileSync(doc.path, newContent, 'utf-8');
    magicDocThrottle.set(doc.path, Date.now());
    pushLog('ui', `已更新 Magic Doc: ${doc.title}`);
  }
}
```

#### 4.3 触发点

在 `finalizeClawRun()` 和 `finalizePersistentHostTurn()` 末尾：

```javascript
// 异步触发，不阻塞主流程
if (exitCode === 0 || !didFail) {
  setImmediate(async () => {
    try {
      const docs = scanMagicDocs(workspaceDir);
      for (const doc of docs) {
        await updateMagicDoc(doc, state.transcript, state.config);
      }
    } catch (err) {
      pushLog('error', `MagicDocs 更新失败：${err.message}`);
    }
  });
}
```

#### 4.4 验证标准

- 创建文件 `test-magic.md`，内容：`# MAGIC DOC: 测试文档\n\n初始内容`
- 跑一轮关于某个技术的对话
- 检查文件是否被更新，内容是否包含对话中提到的信息

---

### Part 5：autoDream 记忆整合

**目标**：空闲时自动扫描最近会话，把有价值的信息沉淀到持久记忆

#### 5.1 门槛检查

```javascript
function shouldRunDream(workspaceDir) {
  const memDir = join(workspaceDir, '.claw', 'memory');

  // 1. 当前必须空闲
  if (state.run.status !== 'idle') return false;

  // 2. 锁检查
  const lockPath = join(memDir, '.dream-lock');
  if (existsSync(lockPath)) {
    const lockAge = Date.now() - statSync(lockPath).mtimeMs;
    if (lockAge < 30 * 60 * 1000) return false; // 30 分钟内有锁
    unlinkSync(lockPath); // 过期锁，清理
  }

  // 3. 距上次整合 ≥ 24 小时
  const lastDreamPath = join(memDir, '.last-dream');
  if (existsSync(lastDreamPath)) {
    const lastDream = parseInt(readFileSync(lastDreamPath, 'utf-8'), 10);
    if (Date.now() - lastDream < 24 * 60 * 60 * 1000) return false;
  }

  // 4. 期间累计 ≥ 3 个有实际内容的会话
  const sessions = loadAppSessions();
  const recentSessions = sessions.filter(s => {
    const hasContent = s.transcript && s.transcript.length >= 2;
    const lastDream = getLastDreamTime(memDir);
    return hasContent && s.lastModified > lastDream;
  });

  return recentSessions.length >= 3;
}
```

#### 5.2 整合逻辑

```javascript
async function runDream(workspaceDir, config) {
  const memDir = join(workspaceDir, '.claw', 'memory');
  const lockPath = join(memDir, '.dream-lock');

  // 创建锁
  writeFileSync(lockPath, String(Date.now()), 'utf-8');
  pushTimelineEntry('status', 'running', '正在整合记忆...');

  try {
    // 1. 读取现有记忆
    const existingMemory = loadMemoryContext(workspaceDir);

    // 2. 读取最近会话摘要
    const sessions = loadAppSessions();
    const lastDream = getLastDreamTime(memDir);
    const recentSessions = sessions
      .filter(s => s.lastModified > lastDream && s.transcript?.length >= 2)
      .slice(-10); // 最多 10 个会话

    const sessionSummaries = recentSessions.map(s => {
      const messages = s.transcript
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-8)
        .map(m => `${m.role}: ${m.content?.slice(0, 300)}`)
        .join('\n');
      return `### 会话 ${s.sessionId} (${new Date(s.lastModified).toLocaleString()})\n${messages}`;
    }).join('\n\n');

    // 3. 构建整合 prompt
    const prompt = `
你是一个记忆整合代理。你的任务是从最近的对话中提取有价值的信息，更新到持久记忆中。

当前持久记忆：
<existing_memory>
${existingMemory}
</existing_memory>

最近的对话：
<recent_sessions>
${sessionSummaries}
</recent_sessions>

请执行以下步骤：
1. 找出新的、有价值的信息（用户偏好、项目决策、重要事实）
2. 与现有记忆对比，避免重复
3. 更新或新建记忆条目
4. 删除已过时的记忆

输出格式（JSON）：
{
  "updates": [
    { "file": "topics/user-preferences.md", "content": "完整文件内容..." },
    { "file": "topics/tech-decisions.md", "content": "完整文件内容..." }
  ],
  "index": "更新后的 MEMORY.md 完整内容...",
  "summary": "本次整合了 N 条新记忆，更新了 M 个文件"
}

如果没有需要更新的内容，返回：
{ "updates": [], "index": null, "summary": "无新信息需要整合" }
`;

    // 4. 调 LLM
    const gatewayUrl = `http://127.0.0.1:${config.gatewayPort}/v1/messages`;
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.upstreamApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.upstreamModel,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`LLM 调用失败: ${response.status}`);

    const result = await response.json();
    const text = result.content?.[0]?.text;

    // 5. 解析并写入
    const parsed = JSON.parse(text); // 需要 robust JSON 解析

    for (const update of parsed.updates || []) {
      const filePath = join(memDir, update.file);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, update.content, 'utf-8');
    }

    if (parsed.index) {
      writeFileSync(join(memDir, MEMORY_INDEX), parsed.index, 'utf-8');
    }

    // 6. 更新时间戳
    writeFileSync(join(memDir, '.last-dream'), String(Date.now()), 'utf-8');

    pushTimelineEntry('result', 'success', parsed.summary || '记忆整合完成');
    pushLog('ui', `autoDream: ${parsed.summary}`);

  } catch (err) {
    pushTimelineEntry('result', 'error', `记忆整合失败：${err.message}`);
    pushLog('error', `autoDream 失败：${err.message}`);
  } finally {
    // 删除锁
    try { unlinkSync(lockPath); } catch {}
  }
}
```

#### 5.3 定时器

在 `main()` 函数的服务器启动后：

```javascript
// 每 15 分钟检查一次是否需要整合记忆
setInterval(() => {
  const workspaceDir = state.config?.workspaceDir;
  if (workspaceDir && shouldRunDream(workspaceDir)) {
    runDream(workspaceDir, state.config).catch(err => {
      pushLog('error', `autoDream 定时检查失败：${err.message}`);
    });
  }
}, 15 * 60 * 1000);

// 对话结束后也检查一次
// 在 finalizeClawRun() 末尾加：
if (workspaceDir && shouldRunDream(workspaceDir)) {
  setImmediate(() => runDream(workspaceDir, state.config).catch(() => {}));
}
```

#### 5.4 验证标准

- 累计 3 个以上有内容的会话
- 等待 15 分钟（或手动触发 `POST /api/dream`）
- 检查 `.claw/memory/topics/` 下生成了新文件
- 检查 MEMORY.md 索引被更新
- 新建会话问"你记得之前我们讨论了什么" → 能回忆起来

---

## 三、执行顺序和分工

```
Part 1: SOUL 系统         ← 第一个对话做，~100 行，30 分钟
Part 2: Memory 系统       ← 同一个对话接着做，~250 行，1 小时
Part 3: 飞书适配器        ← 第二个对话做，~300 行，需要用户配合创建飞书应用
Part 4: MagicDocs         ← 第三个对话做，~180 行
Part 5: autoDream         ← 同一个对话接着做，~220 行（依赖 Part 2）
```

**每个 Part 完成后必须验证**：
1. `npm --prefix ai-code-studio run lint` — 零错误
2. `npm --prefix ai-code-studio run build` — 成功
3. 手动测试对应的验证标准

---

## 四、给新对话的完整指令

```
工作目录：F:\CODE-CLAW
项目名：claw-code（不要改名）
语言：中文回复，代码注释英文
不要推翻现有架构，在现有代码上扩展

核心文件：
  - tools/claw-launcher-ui/server.mjs（后端，3349 行，所有新功能都加在这里）
  - tools/model-gateway/server.mjs（模型网关，不需要改）
  - ai-code-studio/src/App.tsx（前端主入口）
  - ai-code-studio/src/components/ConversationPane.tsx（聊天界面）
  - ai-code-studio/src/components/SetupSidebar.tsx（侧栏）

交接文档：HANDOFF_TASKBOOK.md（聊天主路径问题，R0 系列）
进化计划：PLAN.md（本文件，SOUL/Memory/飞书/MagicDocs/autoDream）

请先读 PLAN.md，从 Part 1（SOUL 系统）开始执行。
每个 Part 做完跑 lint + build 验证。
```
