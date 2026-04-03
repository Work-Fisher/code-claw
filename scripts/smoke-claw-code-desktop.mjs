import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const launcherScript = path.join(rootDir, 'tools', 'claw-launcher-ui', 'server.mjs')
const publicDir = path.join(rootDir, 'ai-code-studio', 'dist')
const mockScript = path.join(rootDir, 'tools', 'mock-openai', 'server.mjs')
const clawBinaryPath = path.join(rootDir, 'claw-code', 'rust', 'target', 'release', 'claw.exe')
const launcherDataDir = path.join(rootDir, 'tools', 'claw-launcher-ui', 'data')
const settingsPath = path.join(launcherDataDir, 'settings.json')
const sessionsPath = path.join(launcherDataDir, 'app-sessions.json')
const runtimeStatePath = path.join(launcherDataDir, 'runtime-state.json')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function spawnService(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => {
    process.stdout.write(`[${label}:out] ${chunk}`)
  })
  child.stderr.on('data', chunk => {
    process.stderr.write(`[${label}:err] ${chunk}`)
  })
  child.on('error', error => {
    process.stderr.write(`[${label}:err] ${error.stack || error.message}\n`)
  })

  return child
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('无法获取可用端口。')))
        return
      }
      server.close(closeError => {
        if (closeError) {
          reject(closeError)
          return
        }
        resolve(address.port)
      })
    })
  })
}

async function waitForJson(url, attempts = 60, delayMs = 500) {
  let lastError = null

  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return await response.json()
      }
      lastError = new Error(`${url} returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(delayMs)
  }

  throw lastError || new Error(`等待 ${url} 超时。`)
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `${url} returned ${response.status}`)
  }
  return data
}

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function restoreOptionalFile(filePath, snapshot) {
  if (snapshot === null) {
    await rm(filePath, { force: true }).catch(() => {})
    return
  }
  await writeFile(filePath, snapshot, 'utf8')
}

async function terminate(child) {
  if (!child || child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(4000).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
      }
    }),
  ])
}

async function waitForCompletedTurn(uiUrl) {
  let lastState = null
  for (let index = 0; index < 120; index += 1) {
    lastState = await waitForJson(`${uiUrl}/api/state`, 1, 1)
    const lastAssistant = [...(lastState.transcript || [])]
      .reverse()
      .find(entry => entry.role === 'assistant')

    if (lastState.run.status === 'idle' && lastAssistant?.content) {
      return {
        state: lastState,
        lastAssistant,
      }
    }

    await sleep(500)
  }

  throw new Error('桌面 launcher 没有在预期时间内完成本轮运行。')
}

async function main() {
  await mkdir(launcherDataDir, { recursive: true })

  const originalSettings = await readOptionalFile(settingsPath)
  const originalSessions = await readOptionalFile(sessionsPath)
  const originalRuntimeState = await readOptionalFile(runtimeStatePath)

  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'claw-code-desktop-smoke-'))
  const mockPort = await getFreePort()
  const gatewayPort = await getFreePort()
  const uiPort = await getFreePort()
  const mockUrl = `http://127.0.0.1:${mockPort}`
  const uiUrl = `http://127.0.0.1:${uiPort}`

  const mock = spawnService('mock-openai', process.execPath, [mockScript], {
    MOCK_OPENAI_PORT: String(mockPort),
  })
  const launcher = spawnService('claw-ui', process.execPath, [launcherScript], {
    CLAW_UI_PUBLIC_DIR: publicDir,
    CLAW_UI_HOST: '127.0.0.1',
    CLAW_UI_PORT: String(uiPort),
    CLAW_UI_DESKTOP: '1',
  })

  try {
    await waitForJson(`${mockUrl}/health`)
    await waitForJson(`${uiUrl}/api/state`)

    await postJson(`${uiUrl}/api/config`, {
      upstreamBaseUrl: mockUrl,
      upstreamApiKey: 'dummy',
      upstreamModel: 'smoke-model',
      clawModel: 'smoke-model',
      textMode: 'openai',
      workspaceDir,
      clawProjectDir: path.join(rootDir, 'claw-code'),
      clawBinaryPath,
      gatewayHost: '127.0.0.1',
      gatewayPort,
      permissionMode: 'workspace-write',
      runner: 'binary',
    })

    const connection = await postJson(`${uiUrl}/api/test-connection`, {
      config: {
        upstreamBaseUrl: mockUrl,
        upstreamApiKey: 'dummy',
        upstreamModel: 'smoke-model',
        clawModel: 'smoke-model',
        textMode: 'openai',
        workspaceDir,
        clawProjectDir: path.join(rootDir, 'claw-code'),
        clawBinaryPath,
        gatewayHost: '127.0.0.1',
        gatewayPort,
        permissionMode: 'workspace-write',
        runner: 'binary',
      },
    })

    if (!connection.ok) {
      console.error('Connection test failed:', JSON.stringify(connection, null, 2))
      throw new Error('连接测试未通过。')
    }

    await postJson(`${uiUrl}/api/chat`, {
      prompt: '只回复”桌面烟测通过”，不要调用任何工具。',
      config: {
        upstreamBaseUrl: mockUrl,
        upstreamApiKey: 'dummy',
        upstreamModel: 'smoke-model',
        clawModel: 'smoke-model',
        textMode: 'openai',
        workspaceDir,
        clawProjectDir: path.join(rootDir, 'claw-code'),
        clawBinaryPath,
        gatewayHost: '127.0.0.1',
        gatewayPort,
        permissionMode: 'workspace-write',
        runner: 'binary',
      },
    })

    const { state, lastAssistant } = await waitForCompletedTurn(uiUrl)
    const diagnostics = await waitForJson(`${uiUrl}/api/diagnostics`)
    const diagnosticsExport = await waitForJson(`${uiUrl}/api/diagnostics/export`)

    console.log(
      JSON.stringify(
        {
          ok: true,
          gatewayStatus: state.gateway.status,
          runStatus: state.run.status,
          sessionId: state.run.sessionId,
          transcriptCount: state.transcript.length,
          lastAssistant: lastAssistant.content,
          diagnosticsGeneratedAt: diagnostics.generatedAt,
          diagnosticsExported: Boolean(diagnosticsExport?.payload),
        },
        null,
        2,
      ),
    )
  } finally {
    try {
      await fetch(`${uiUrl}/api/shutdown`, { method: 'POST' })
    } catch {
      // ignore
    }

    await terminate(launcher)
    await terminate(mock)
    await restoreOptionalFile(settingsPath, originalSettings)
    await restoreOptionalFile(sessionsPath, originalSessions)
    await restoreOptionalFile(runtimeStatePath, originalRuntimeState)
    await rm(workspaceDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
