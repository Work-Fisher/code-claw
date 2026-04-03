# Code-Claw 早期测试阶段V1

**本地部署的个人 AI 编程助手** 
**记忆系统仍有问题，需要多轮对话后可保存，人格系统仍处于测试阶段**
> 支持 DeepSeek、Kimi、通义千问、豆包、智谱、Gemini、OpenAI 等所有 OpenAI 兼容的模型 API。

---

## 致谢

本项目站在巨人的肩膀上，核心代码与设计思路源自以下两个优秀的开源项目：

- **[OpenClaw](https://github.com/openclaw/openclaw)** — 开源个人 AI 助手的标杆项目。Code-Claw 的 SOUL 人格系统、持久记忆架构、Bootstrap 注入链等核心设计均受其启发。OpenClaw 团队对"本地优先、用户数据自主"理念的坚持，是我们一直追随的方向。

- **[claw-code](https://github.com/ultraworkers/claw-code)** — Code-Claw 的 AI 运行时基础。claw-code 提供了完整的 Rust 编译 REPL 运行时、工具调用框架和 Anthropic 协议兼容层，是整个项目能够运行的底座。

没有这两个项目，Code-Claw 不会存在。在此向两个项目的作者和社区表示由衷的感谢。

---

## 声明

> **由于时间紧张，本项目仍处于早期阶段，许多功能来不及充分测试。** 目前完成了三阶段融合方案中的 Phase 1（灵魂 + 记忆），Phase 2（插件 + 向量搜索）和 Phase 3（引擎 + 多 Agent）的详细设计已写入 [`PROJECT-REPORT.html`](PROJECT-REPORT.html)，恳请后续开发者继续推进。

---

## 我们做了什么

基于 claw-code 的桌面助手框架，我们深入研究了 OpenClaw 的架构设计，制定了三阶段融合方案，并完成了 Phase 1 的核心实现：

### Phase 1 已完成 ✅

| 功能 | 说明 | 
|------|------|
| **SOUL 人格系统** | 参照 OpenClaw 的 bootstrap 链设计，实现了多文件人格注入（SOUL.md + IDENTITY.md + USER.md + CONTEXT.md），支持热重载、字符上限管控、设置页编辑器 |
| **持久记忆系统** | 跨会话记忆，包含 MEMORY.md 索引、frontmatter 类型化记忆文件（user/feedback/project/reference 四类）、每日交互日志、LLM 驱动的 autoDream 记忆整合 |
| **记忆面板 UI** | 前端可视化管理记忆：浏览索引、编辑文件、查看日志、手动触发整合、LLM 语义搜索 |
| **model-gateway 增强** | SOUL + Memory 注入到 system prompt、API Key 透传、Kimi reasoning_content 兼容（自动转 thinking block）、max_tokens 安全裁剪 |
| **代理自动检测** | Windows 系统代理自动检测并传递给 claw.exe，NO_PROXY 排除本地连接 |
| **Electron 打包优化** | 修复 Portable exe 的路径解析、数据持久化、Gateway 进程启动等打包后运行问题 |
| **多项体验优化** | 启动恢复最近会话、配置保存即时反馈、hasUnsavedConfig 忽略加密存储差异、workspaceLooksBroad 阈值调整 |

### 已知问题 ⚠️

- **REPL 多轮工具调用**：claw.exe 的持久 REPL 模式在触发工具调用（如 WebSearch）后，第二轮请求可能因 reasoning_content 协议不兼容而卡死。单次 prompt 模式不受影响。
- **推理模型速度**：kimi-k2.5 等推理模型的 reasoning 阶段耗时不可预测（10秒~2分钟），建议日常使用 DeepSeek-chat 等非推理模型。
- **前端 TypeScript 既有错误**：ConversationPane.tsx 等组件存在少量 TS 类型错误，不影响运行但 `tsc --noEmit` 会报错。

### 后续计划 📋

Phase 2 和 Phase 3 的详细设计已写入 [`PROJECT-REPORT.html`](PROJECT-REPORT.html) 和 [`PLAN.md`](PLAN.md)，包括：

- **Phase 2**：向量记忆搜索（TF-IDF 或 embedding）、Plugin SDK 契约、飞书/钉钉通道、MCP 基础支持
- **Phase 3**：上下文引擎（对话压缩前自动 flush）、Cron 定时任务、多 Agent 路由、设备节点

---

## 快速开始

**前置要求**：Node.js >= 22（[下载](https://nodejs.org/)）

```bash
git clone https://github.com/Work-Fisher/code-claw.git
cd code-claw
npm install
cd ai-code-studio && npm install && cd ..
npm run ai-code-studio:build
npm run ai-code-studio:desktop
```

### 首次配置

1. 启动后弹出**首启向导**
2. 选择模型供应商（如 DeepSeek），填入 API Key
3. 选择工作区目录
4. 保存 → 开始对话

---

## 支持的模型

| 供应商 | 推荐模型 | Base URL | 说明 |
|--------|---------|----------|------|
| **DeepSeek** | deepseek-chat | `https://api.deepseek.com` | 推荐日常使用，快速稳定 |
| **Kimi** | kimi-k2.5 | `https://api.moonshot.cn/v1` | 推理能力强，但速度较慢 |
| **通义千问** | qwen-turbo | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 阿里云，国内稳定 |
| **智谱** | glm-4-flash | `https://open.bigmodel.cn/api/paas/v4` | 清华系，中文理解好 |
| **OpenAI** | gpt-4o | `https://api.openai.com/v1` | 需要海外网络 |
| **Gemini** | gemini-pro | 选择 Gemini 协议模式 | Google，有免费额度 |
| **自定义** | 任意 | 自定义 URL | 任何 OpenAI 兼容 API |

---

## 项目结构

```
code-claw/
├── ai-code-studio/          # React 前端
│   └── src/
│       ├── App.tsx            # 主入口
│       ├── components/        # UI 组件（含 SoulEditor、MemoryPanel）
│       └── app/               # 类型定义、工具函数
├── desktop/                  # Electron 桌面壳
├── tools/
│   ├── claw-launcher-ui/      # 后端核心服务
│   │   ├── server.mjs         # 主逻辑（HTTP API、会话管理、SSE 推送）
│   │   ├── bootstrap.mjs      # SOUL 人格系统
│   │   └── memory.mjs         # 持久记忆系统
│   └── model-gateway/         # 模型协议网关
│       └── server.mjs         # Anthropic <-> OpenAI/Gemini 协议适配
├── claw-code/                # AI 运行时（Rust 编译的 claw.exe）
├── .claw/                    # 运行时数据（人格 + 记忆）
│   ├── bootstrap/SOUL.md      # AI 人格定义
│   └── memory/                # 记忆索引和文件
├── PROJECT-REPORT.html       # 完整技术报告（架构设计、Bug 修复、后续计划）
├── PLAN.md                   # 三阶段融合方案详细设计
└── .claude/commands/          # 7 个 Skill 文件
```

---

## 技术文档

- [`PROJECT-REPORT.html`](PROJECT-REPORT.html) — 完整的融合报告，包括架构对比、已完成工作、Bug 修复记录、后续三阶段详细方案
- [`PLAN.md`](PLAN.md) — 三阶段融合方案的规划文档
- [`HANDOFF_TASKBOOK.md`](HANDOFF_TASKBOOK.md) — 开发交接任务清单
- [`DELIVERY.md`](DELIVERY.md) — 交付说明与发布检查清单

---

## 参与贡献

欢迎 PR！当前最需要帮助的方向：

1. **REPL 多轮稳定性** — 修复工具调用后的 reasoning_content 协议兼容问题
2. **向量记忆搜索** — 用 TF-IDF 或本地 embedding 实现语义检索
3. **飞书/钉钉通道** — Channel 抽象层已设计好，需要实现和测试
4. **更多模型适配** — 测试并解决不同模型的协议差异

详细的技术方案和架构设计见 [`PROJECT-REPORT.html`](PROJECT-REPORT.html)。

---

## License

[MIT](LICENSE)
