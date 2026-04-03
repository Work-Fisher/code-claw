import { parseArgs } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const recoveredDir = join(root, 'recovered-claude-code')
const gatewayScript = join(root, 'tools', 'model-gateway', 'server.mjs')
const recoveredCliScript = join(recoveredDir, 'scripts', 'run-cli.ps1')

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: false,
  options: {
    'upstream-base-url': { type: 'string' },
    'upstream-api-key': { type: 'string', default: '' },
    'upstream-model': { type: 'string' },
    'recovered-model': { type: 'string' },
    'gateway-host': { type: 'string', default: '127.0.0.1' },
    'gateway-port': { type: 'string', default: '8787' },
    bare: { type: 'boolean', default: true },
    prompt: { type: 'string', default: '' },
    'output-format': { type: 'string', default: 'text' },
    help: { type: 'boolean', default: false },
  },
})

if (values.help || !values['upstream-base-url'] || !values['upstream-model']) {
  console.log(`Usage:
  node scripts/run-recovered-through-gateway.mjs \\
    --upstream-base-url <url> \\
    --upstream-model <model> \\
    [--upstream-api-key <key>] \\
    [--recovered-model <model>] \\
    [--gateway-host 127.0.0.1] \\
    [--gateway-port 8787] \\
    [--prompt "你好"] \\
    [--output-format text|json|stream-json] \\
    [--bare] \\
    [-- <extra recovered cli args>]
`)
  process.exit(values.help ? 0 : 1)
}

const upstreamBaseUrl = values['upstream-base-url']
const upstreamApiKey = values['upstream-api-key'] ?? ''
const upstreamModel = values['upstream-model']
const recoveredModel = values['recovered-model'] || upstreamModel
const gatewayHost = values['gateway-host'] || '127.0.0.1'
const gatewayPort = Number.parseInt(values['gateway-port'] || '8787', 10)
const prompt = values.prompt || ''
const outputFormat = values['output-format'] || 'text'
const bare = values.bare !== false
const extraCliArgs = positionals
const gatewayUrl = `http://${gatewayHost}:${gatewayPort}`

const gatewayLogs = { stdout: '', stderr: '' }
let shuttingDown = false
let gatewayChild
let recoveredChild

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForGateway(url, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // retry
    }
    await sleep(1000)
  }
  throw new Error(
    `Gateway did not become healthy at ${url}\nSTDOUT:\n${gatewayLogs.stdout}\nSTDERR:\n${gatewayLogs.stderr}`,
  )
}

function killChild(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return
  }
  try {
    child.kill('SIGTERM')
  } catch {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }
}

async function shutdown(code = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  killChild(recoveredChild)
  killChild(gatewayChild)
  await sleep(200)
  process.exit(code)
}

process.on('SIGINT', () => {
  void shutdown(130)
})
process.on('SIGTERM', () => {
  void shutdown(143)
})

gatewayChild = spawn(process.execPath, [gatewayScript], {
  cwd: root,
  env: {
    ...process.env,
    OPENAI_COMPAT_BASE_URL: upstreamBaseUrl,
    OPENAI_COMPAT_API_KEY: upstreamApiKey,
    OPENAI_COMPAT_MODEL: upstreamModel,
    GATEWAY_HOST: gatewayHost,
    GATEWAY_PORT: String(gatewayPort),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

gatewayChild.stdout?.on('data', chunk => {
  const text = chunk.toString()
  gatewayLogs.stdout += text
})
gatewayChild.stderr?.on('data', chunk => {
  const text = chunk.toString()
  gatewayLogs.stderr += text
})
gatewayChild.on('exit', code => {
  if (!shuttingDown && recoveredChild && recoveredChild.exitCode === null) {
    console.error('Gateway exited unexpectedly.')
    if (gatewayLogs.stdout) {
      console.error(gatewayLogs.stdout)
    }
    if (gatewayLogs.stderr) {
      console.error(gatewayLogs.stderr)
    }
    void shutdown(code ?? 1)
  }
})

await waitForGateway(gatewayUrl)
console.log(`Gateway ready at ${gatewayUrl}`)

const cliArgs = []
if (bare) {
  cliArgs.push('--bare')
}
cliArgs.push('--model', recoveredModel)
if (prompt) {
  cliArgs.push('-p')
  if (outputFormat !== 'text') {
    cliArgs.push('--output-format', outputFormat)
  }
  cliArgs.push(prompt)
}
cliArgs.push(...extraCliArgs)

recoveredChild = spawn(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', recoveredCliScript, ...cliArgs],
  {
    cwd: recoveredDir,
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: gatewayUrl,
      ANTHROPIC_API_KEY: upstreamApiKey || 'dummy',
      CLAUDE_CODE_DISABLE_BOOTSTRAP_FETCH: '1',
    },
    stdio: 'inherit',
  },
)

recoveredChild.on('exit', code => {
  void shutdown(code ?? 0)
})
