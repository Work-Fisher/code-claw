# claw-code 桌面版交接任务书

## 1. 项目目标

本项目的目标不是做一个“能运行的 demo”，而是交付一个可安装、可首启配置、可进行多轮对话、可调用本地 `claw-code` Rust 运行时、可接任意 OpenAI-compatible 上游模型的桌面产品。

当前技术方向已经基本定型：

- 前端：`ai-code-studio`
- 桌面壳：Electron
- 桌面主进程：`desktop/main.mjs`
- 本地宿主层：`tools/claw-launcher-ui/server.mjs`
- 模型网关：`tools/model-gateway/server.mjs`
- 底层运行时：`claw-code/rust/target/release/claw.exe`

目标产品形态：

- 用户双击即可运行
- 首次进入有向导
- 配置 Provider、工作区和运行时后即可开始对话
- 支持连续会话、工具调用、诊断导出、桌面打包
- 不绑定单一模型供应商

---

## 2. 当前已完成内容

### 2.1 架构层

- 已接入 Electron 桌面壳
- 已有 preload / IPC 桥
- 已有本地 launcher
- 已有模型网关
- 已接入 `claw.exe`
- 已支持安全存储 API key
- 已支持打包 Windows 便携版

### 2.2 产品层

- 启动向导
- 独立设置页
- 诊断页与诊断导出
- 会话搜索、重命名、删除
- 工具工作台
- 高风险审批与队列
- 原生长驻 REPL 宿主优先，失败回退到单次 `prompt`
- 桌面菜单、关于页、版本信息
- 本地烟测脚本

### 2.3 当前可运行产物

- 单文件便携版：
  [claw-code-0.1.0-x64.exe](dist/electron-builder/claw-code-0.1.0-x64.exe)
- 解包目录版：
  [claw-code.exe](dist/electron-builder/win-unpacked/claw-code.exe)
- 本地启动脚本：
  [launch-claw-code-desktop.cmd](launch-claw-code-desktop.cmd)

### 2.4 当前已跑通验证

```powershell
npm --prefix ai-code-studio run lint
npm --prefix ai-code-studio run build
node --check tools/claw-launcher-ui/server.mjs
node --check desktop/main.mjs
node --check scripts/smoke-claw-code-desktop.mjs
npm run ai-code-studio:smoke
npm run ai-code-studio:dist
```

---

## 3. 当前真实状态判断

必须实话实说：**当前版本已经不是 demo，但仍未达到“放心直接交付给普通用户”的最终稳定线。**

主要原因不是功能缺失，而是**聊天主路径还有体验与正确性问题**。这些问题会直接影响用户对产品的第一印象，因此必须作为最高优先级继续处理，不能因为已经能打包就当成完成。

当前判断：

- 架构可继续沿用，不建议推翻重做
- 打包链可继续沿用
- 桌面壳、设置、诊断、会话管理等基础设施已具备
- **聊天主界面和消息链路是当前最高风险区域**

---

## 4. 当前阻塞发布的问题

以下问题属于 **发布阻塞项**，在修完前不建议对外发版。

### 4.1 聊天顺序错乱

现象：

- 用户消息和助手消息显示顺序不稳定
- 有时助手回复会跑到用户问题前面

原因：

- 长驻 REPL 从会话文件回读消息时，时间戳和当前 live transcript 没完全对齐
- 前端又按时间排序，因此顺序会乱

涉及文件：

- [server.mjs](tools/claw-launcher-ui/server.mjs)
- [helpers.ts](ai-code-studio/src/app/helpers.ts)

验收标准：

- 用户连续发送两句后，界面中永远是先显示用户消息，再显示对应助手回复
- 多轮会话中顺序稳定，不因刷新或切会话而重排

### 4.2 聊天主视图仍然混入运行过程感

现象：

- 用户感觉像在看“运行面板”而不是“聊天界面”
- `claw-code 已启动`、`运行完成`、工具过程卡片仍然会干扰主聊天体验

原因：

- 之前为了暴露 runtime 能力，把活动流和聊天流混在一起展示

涉及文件：

- [ConversationPane.tsx](ai-code-studio/src/components/ConversationPane.tsx)

验收标准：

- 默认 `聊天` 标签页只显示用户消息和助手消息
- 运行事件、工具详情、补丁预览全部下沉到 `协作`/`代码`/诊断区域

### 4.3 发送反馈仍不够即时

现象：

- 用户点击发送后，虽然比之前好，但体感仍可能觉得“消息不是立刻发出”
- 没有真正的本地乐观更新

原因：

- 当前是前端先调 `/api/chat`，再等待状态流更新；虽然接口已改成立即返回，但 UI 还没有完整的“本地 pending 消息”策略

涉及文件：

- [App.tsx](ai-code-studio/src/App.tsx)
- [ConversationPane.tsx](ai-code-studio/src/components/ConversationPane.tsx)
- [server.mjs](tools/claw-launcher-ui/server.mjs)

验收标准：

- 点击发送后，用户消息立即出现在对话区
- 输入框立即清空
- 不依赖服务端完成整轮运行才显示该条用户消息

### 4.4 会话恢复策略仍需更保守

现象：

- 打开应用后可能进入不该自动续上的旧会话
- 用户会感觉“我只是发了一句你好，怎么它在说以前别的项目”

原因：

- 历史会话和恢复逻辑偏激进

涉及文件：

- [server.mjs](tools/claw-launcher-ui/server.mjs)

验收标准：

- 默认进入干净聊天态
- 只有明确选中会话或存在“未完成/中断的当前会话”时才恢复
- 不会无提示接入旧工作上下文

### 4.5 助手身份和系统语气仍可能被旧上下文污染

现象：

- 回复里出现“我是 Claude”“我在某某项目里能帮你做什么”这类明显不该出现的内容

可能原因：

- 旧会话污染
- REPL 宿主和回退 `prompt` 模式提示词不一致
- 上游 provider 的返回被错误地当成当前会话首答

涉及文件：

- [server.mjs](tools/claw-launcher-ui/server.mjs)
- [model-gateway/server.mjs](tools/model-gateway/server.mjs)

验收标准：

- 全新会话下第一句问“你是谁”，回复应围绕当前产品定义，而不是泄露历史上下文或别的项目名

---

## 5. 推荐的后续工作顺序

下面是建议下一位开发者严格按顺序推进的工作计划。

## R0：发布阻塞修复

这一阶段的目标是：**把聊天主路径修顺。**

### R0-1 消息顺序彻底稳定

- 审查 REPL 增量 transcript 的时间戳策略
- 审查前端排序是否仍有异常路径
- 为“发送两条消息、收到两条回复”的顺序新增回归测试

完成标准：

- 不再出现用户消息在底部、助手回复插到前面

### R0-2 做本地乐观消息

- 发送后立即在前端插入一条本地用户消息
- 该消息在状态流回来后与真实 transcript 对齐
- 避免闪烁和重复

完成标准：

- 发送即时反馈接近正常 IM / Claude / ChatGPT

### R0-3 纯聊天视图收口

- `聊天` 页只保留 user / assistant 消息
- 活动卡、工具卡、运行卡不要再污染默认聊天流
- `协作` 显示活动和审批
- `代码` 显示工具工作台和补丁

完成标准：

- 普通用户第一次进入就能看懂

### R0-4 会话恢复重构

- 细化“自动恢复”的条件
- 引入“继续上次会话 / 开始新会话”的更明确提示
- 避免静默恢复旧脏数据

完成标准：

- 不再出现“发一句你好，结果先读到旧项目历史”

### R0-5 真机回归

手工回归以下路径：

1. 全新安装首次启动
2. 完成向导后发第一条消息
3. 连续两轮聊天
4. 新建会话
5. 切换旧会话
6. 关闭应用后重新打开
7. 中断运行后恢复

---

## R1：产品体验补完

这一阶段是在 R0 稳住后做。

### R1-1 顶部标签重构

- 重新定义 `聊天 / 协作 / 代码`
- 默认停留在聊天
- 协作显示审批、队列、运行状态
- 代码显示工具工作台、文件改动、diff

### R1-2 输入区体验提升

- 发送中的按钮状态更清晰
- 增加“正在思考 / 正在运行工具 / 等待审批”细粒度状态
- 输入区 placeholder 更产品化

### R1-3 会话区体验提升

- 会话项增加最后一句摘要或最后更新时间
- 当前会话状态更直观
- 会话搜索高亮

### R1-4 中文文案统一

虽然大部分界面已经中文化，但仍建议统一做一次文案收口：

- 保持产品口径一致
- 去掉工程味过重的文案
- 保持“用户视角”而不是“开发视角”

---

## R2：正式发布准备

这一阶段才进入“真正交付”。

### R2-1 发布资产整理

- 整理安装包命名
- 整理版本号策略
- 整理变更说明
- 生成发布截图

### R2-2 应用图标与品牌收尾

当前已接入自定义图标路径，但还需要：

- 检查 exe 图标是否在资源管理器、任务栏、窗口标题栏完全一致
- 检查安装包图标是否正确

### R2-3 在线更新或版本检查

当前还没有自动更新。

最低要求：

- 至少有版本检查
- 至少能在设置页里看到当前版本和更新提示

### R2-4 发布清单执行

参考：

- [DELIVERY.md](DELIVERY.md)

但正式发布前需要把该文档升级成：

- 面向外部协作者的版本说明
- 面向测试人员的回归清单
- 面向最终用户的首启文档

---

## 6. 关键代码位置

### 前端

- 主入口：
  [App.tsx](ai-code-studio/src/App.tsx)
- 聊天主界面：
  [ConversationPane.tsx](ai-code-studio/src/components/ConversationPane.tsx)
- 左侧侧栏：
  [SetupSidebar.tsx](ai-code-studio/src/components/SetupSidebar.tsx)
- 设置页：
  [SettingsDialog.tsx](ai-code-studio/src/components/SettingsDialog.tsx)
- 启动向导：
  [SetupWizard.tsx](ai-code-studio/src/components/SetupWizard.tsx)
- 诊断页：
  [DiagnosticsPanel.tsx](ai-code-studio/src/components/DiagnosticsPanel.tsx)
- 工具工作台：
  [ToolWorkbenchPanel.tsx](ai-code-studio/src/components/ToolWorkbenchPanel.tsx)
- 帮助函数与排序：
  [helpers.ts](ai-code-studio/src/app/helpers.ts)
- 类型定义：
  [types.ts](ai-code-studio/src/app/types.ts)

### 桌面壳

- 主进程：
  [main.mjs](desktop/main.mjs)
- preload：
  [preload.cjs](desktop/preload.cjs)
- 打包配置：
  [electron-builder.yml](electron-builder.yml)

### 后端宿主

- launcher：
  [server.mjs](tools/claw-launcher-ui/server.mjs)
- 上游网关：
  [server.mjs](tools/model-gateway/server.mjs)
- 烟测脚本：
  [smoke-claw-code-desktop.mjs](scripts/smoke-claw-code-desktop.mjs)

### 底层运行时

- Rust 可执行文件：
  [claw.exe](claw-code/rust/target/release/claw.exe)
- Rust 主入口：
  [main.rs](claw-code/rust/crates/rusty-claude-cli/src/main.rs)

---

## 7. 接手人第一天建议执行的动作

### 第一步：拉起并跑验证

```powershell
npm --prefix ai-code-studio run lint
npm --prefix ai-code-studio run build
node --check tools/claw-launcher-ui/server.mjs
npm run ai-code-studio:smoke
npm run ai-code-studio:dist
```

### 第二步：复现当前聊天问题

建议用全新会话，做这 4 组操作：

1. `你好`
2. `你是 claude 吗`
3. 新建会话后再发 `你好`
4. 关闭应用再打开，观察是否自动进入旧会话

观察点：

- 发送是否即时
- 顺序是否稳定
- 是否夹杂运行事件
- 是否出现错误身份或旧项目污染

### 第三步：优先只做 R0

不要先做视觉美化、自动更新或发布平台接入。  
当前第一优先级是把聊天主路径稳定下来。

---

## 8. 完成定义

这个项目什么时候算“真的可以交给别人用”：

- 双击即可启动
- 首启向导可完成配置
- 可接至少一个真实 provider 完成稳定多轮聊天
- 新建会话、切换会话、恢复会话行为符合直觉
- 聊天顺序稳定
- 发送反馈即时
- 默认聊天视图足够简单
- 诊断导出可用
- 烟测通过
- 打包通过

---

## 9. 交接备注

当前版本最重要的现实结论：

- **架构不用推翻**
- **产品框架已经成型**
- **真正需要继续打磨的是聊天主路径和最后一公里体验**

如果下一位开发者时间有限，建议只盯：

1. `server.mjs`
2. `ConversationPane.tsx`
3. `helpers.ts`
4. `App.tsx`

这四个文件能决定当前版本 80% 的体验问题。
