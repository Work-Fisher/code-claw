# Compatible Shell

This is a small, runnable CLI shell inspired by Claude Code-style interaction loops.

It keeps three core ideas:

- Anthropic Messages API as the model contract
- local tool execution for coding tasks
- a persistent session transcript per workspace

It intentionally does not try to be a byte-for-byte rebuild of the original client.
Instead, it is designed to run cleanly on plain Node and to route all model traffic
through the external Anthropic-compatible gateway in `tools/model-gateway`.

Public positioning:

- Say it is a compatible alpha shell inspired by Claude Code workflows.
- Do not say it is the official Anthropic client.
- Do not say it is a full Claude Code restoration.

## Start

```powershell
$env:OPENAI_COMPAT_BASE_URL="https://your-openai-compatible-endpoint"
$env:OPENAI_COMPAT_API_KEY="sk-..."
$env:OPENAI_COMPAT_MODEL="your-model-name"
npm run gateway

$env:ANTHROPIC_BASE_URL="http://127.0.0.1:8787"
$env:ANTHROPIC_API_KEY="dummy"
npm run compat-shell -- --cwd "C:\path\to\your\project"
```

## Local commands

- `/help`
- `/tools`
- `/config`
- `/clear`
- `/save`
- `/exit`

## Supported tools

- `list_dir`
- `read_file`
- `write_file`
- `search_text`
- `shell_command`

`shell_command` asks for approval unless `COMPAT_SHELL_AUTO_APPROVE_SHELL=1`.
