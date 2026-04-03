# claw-code 桌面版交付说明

## 当前交付物

- 便携目录版：
  [`dist/electron-builder/win-unpacked/claw-code.exe`](dist/electron-builder/win-unpacked/claw-code.exe)
- 便携单文件版：
  [`dist/electron-builder/claw-code-0.1.0-x64.exe`](dist/electron-builder/claw-code-0.1.0-x64.exe)
- 本地启动入口：
  [`launch-claw-code-desktop.cmd`](launch-claw-code-desktop.cmd)

## 交付前必跑

```powershell
npm --prefix ai-code-studio run lint
npm --prefix ai-code-studio run build
node --check tools/claw-launcher-ui/server.mjs
npm run ai-code-studio:smoke
npm run ai-code-studio:dist
```

## 首次使用流程

1. 启动 `claw-code.exe`
2. 完成启动向导
3. 选择 Provider、工作区、`claw-code` 目录和可执行文件
4. 运行“连接测试”
5. 发送第一条消息

## 当前产品能力

- Electron 桌面壳
- 安全存储 API key
- 启动向导
- 独立设置页
- 诊断面板与诊断导出
- 会话搜索、重命名、删除
- 工具工作台与补丁预览
- 队列与高风险审批
- 原生长驻 REPL 宿主优先，失败自动回退到单次 `prompt`

## 发布检查清单

- 安装包可以直接启动
- 设置、诊断、关于页面可打开
- `New run`、会话切换、日志、诊断可正常使用
- `Kimi` 或其他 OpenAI-compatible provider 能完成至少一轮真实回复
- 本地烟测脚本通过
- 打包产物存在且可打开
- API key 未写入普通配置文件

## 已知剩余项

- 还没有自动更新
- 还没有正式应用图标
- 发布说明仍以本地文档为主，未接入在线更新源
