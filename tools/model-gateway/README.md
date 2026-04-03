# Model Gateway

This server exposes a minimal Anthropic Messages API surface on `http://127.0.0.1:8787` by default and forwards requests to an OpenAI-compatible upstream.

## Environment variables

- `GATEWAY_HOST` default: `127.0.0.1`
- `GATEWAY_PORT` default: `8787`
- `OPENAI_COMPAT_BASE_URL` required
- `OPENAI_COMPAT_API_KEY` optional
- `OPENAI_COMPAT_MODEL` optional
- `OPENAI_COMPAT_CHAT_PATH` default: `/chat/completions`

## Supported flow

- `POST /v1/messages`
- non-stream responses
- stream responses
- Anthropic tool definitions mapped to OpenAI function tools
- OpenAI tool calls mapped back to Anthropic `tool_use`

## Caveats

- This is a pragmatic compatibility layer, not a complete Anthropic protocol clone.
- Vision and mixed multimodal inputs are best-effort.
- Tool-call streaming is buffered and emitted near the end of a streamed response so the downstream Anthropic client still receives a valid tool block.
