# claw-code

`claw-code` is a local beige desktop-style UI for the `claw-code` runtime in this workspace.

## What it does

- Serves a warm Claude-like coding interface
- Launches the local Claw runtime through a small Node backend
- Uses the Anthropic-compatible gateway so Claw can talk to OpenAI-compatible APIs
- Shows session history, tool calls, file-edit summaries, and run timelines in one place

## Workspace layout

- Frontend: `ai-code-studio/`
- Local launcher backend: `tools/claw-launcher-ui/server.mjs`
- Gateway: `tools/model-gateway/server.mjs`
- Claw runtime source: `claw-code/`

## Local development

1. Install frontend dependencies:
   - `npm install`
2. Start the desktop app from the workspace root:
   - `launch-claw-code-desktop.cmd`
3. Or start the complete local app through the script chain:
   - `npm run ai-code-studio:start`
4. If you want to iterate on the React UI separately:
   - `npm run dev`

The Vite dev server proxies `/api` to `http://127.0.0.1:8891`.

## First launch setup

The app now opens with a guided setup flow:

- Welcome
- Provider
- Workspace
- Runtime
- Verify

You can reopen the guide anytime from `Setup guide` in the left sidebar.

The provider API key is stored separately from the normal settings file in desktop mode.

Core fields:

- Upstream base URL
- Upstream API key
- Upstream model
- Claw model
- Workspace directory
- Claw project directory
- Optional Claw binary path

## Claw runner modes

- `auto`: prefers a built Claw binary and falls back to `cargo run`
- `cargo`: always launches from `claw-code/rust/Cargo.toml`
- `binary`: launches the configured binary path, or the default release binary under `claw-code/rust/target/release`

If you do not already have a built binary, install Rust and Cargo so the `cargo` runner can work.

## Sessions

- Session history is loaded from `<workspace>/.claude/sessions`
- Selecting a previous session restores its transcript and tool history into the UI
- Sending a new prompt starts a fresh Claw run with the current settings

## Production-style launch

From the workspace root:

- `launch-claw-code-desktop.cmd`

- `npm run ai-code-studio:desktop`

- `launch-ai-code-studio.cmd`

or

- `powershell -ExecutionPolicy Bypass -File .\scripts\start-ai-code-studio.ps1`

## Packaging

From the workspace root:

- `npm run ai-code-studio:package`

This creates:

- `dist/ai-code-studio-complete`
- `dist/ai-code-studio-complete.zip`

## Notes

- This is a local launcher project, not an official Anthropic release.
- The frontend is served by the Claw launcher backend using `CLAW_UI_PUBLIC_DIR`.
- Saved launcher settings live in `tools/claw-launcher-ui/data/settings.json`.
- In desktop mode, the API key is kept outside that JSON settings file.
