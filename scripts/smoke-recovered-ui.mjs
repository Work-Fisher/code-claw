import { spawn } from 'node:child_process'
import net from 'node:net'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')
const tmpDir = join(rootDir, '.tmp', 'smoke-recovered-ui')
const settingsPath = join(
  rootDir,
  'tools',
  'recovered-launcher-ui',
  'data',
  'settings.json',
)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to obtain a free port.')))
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

async function ensureCleanTmpDir() {
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
}

async function readSettingsSnapshot() {
  try {
    return await readFile(settingsPath, 'utf8')
  } catch {
    return null
  }
}

async function restoreSettingsSnapshot(snapshot) {
  if (snapshot === null) {
    return
  }
  await writeFile(settingsPath, snapshot, 'utf8')
}

function spawnService(label, args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
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
    process.stderr.write(
      `[${label}:err] ${error.stack || error.message}\n`,
    )
  })

  return child
}

async function waitForJson(url, attempts = 40, delayMs = 500) {
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
  throw lastError || new Error(`Timed out waiting for ${url}`)
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

async function waitForCompletedTurn(uiUrl) {
  let lastState = null
  for (let index = 0; index < 80; index += 1) {
    lastState = await waitForJson(`${uiUrl}/api/state`, 1, 1)
    if (
      lastState.run.status === 'idle' &&
      Array.isArray(lastState.transcript) &&
      lastState.transcript.some(entry => entry.role === 'assistant')
    ) {
      return lastState
    }
    await sleep(500)
  }
  throw new Error('Recovered UI did not finish a turn in time.')
}

async function shutdownUi(uiUrl) {
  try {
    await fetch(`${uiUrl}/api/shutdown`, { method: 'POST' })
  } catch {
    // ignore cleanup failures
  }
}

async function terminate(child) {
  if (!child || child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(3000).then(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL')
      }
    }),
  ])
}

async function main() {
  await ensureCleanTmpDir()
  const originalSettings = await readSettingsSnapshot()
  const mockPort = await getFreePort()
  const gatewayPort = await getFreePort()
  const uiPort = await getFreePort()
  const mockUrl = `http://127.0.0.1:${mockPort}`
  const uiUrl = `http://127.0.0.1:${uiPort}`

  const mock = spawnService(
    'mock-openai',
    [join('tools', 'mock-openai', 'server.mjs')],
    {
      MOCK_OPENAI_PORT: String(mockPort),
    },
  )

  const ui = spawnService('recovered-ui', [join('tools', 'recovered-launcher-ui', 'server.mjs')], {
    RECOVERED_UI_PORT: String(uiPort),
    ...(process.env.RECOVERED_UI_PUBLIC_DIR
      ? { RECOVERED_UI_PUBLIC_DIR: process.env.RECOVERED_UI_PUBLIC_DIR }
      : {}),
  })

  try {
    await waitForJson(`${mockUrl}/health`)
    await waitForJson(`${uiUrl}/api/state`)

    await postJson(`${uiUrl}/api/config`, {
      upstreamBaseUrl: mockUrl,
      upstreamApiKey: 'dummy',
      upstreamModel: 'mock-model',
      recoveredModel: 'mock-model',
      workspaceDir: rootDir,
      gatewayHost: '127.0.0.1',
      gatewayPort,
      bare: true,
      outputFormat: 'stream-json',
    })

    const start = await postJson(`${uiUrl}/api/chat`, {
      prompt: '请用中文一句话说明当前项目的作用',
      continueSession: false,
      outputFormat: 'stream-json',
    })

    const finalState = await waitForCompletedTurn(uiUrl)
    const lastAssistant = finalState.transcript
      .filter(entry => entry.role === 'assistant')
      .at(-1)

    console.log(
      JSON.stringify(
        {
          ok: start.ok === true,
          gatewayStatus: finalState.gateway.status,
          runStatus: finalState.run.status,
          sessionId: finalState.run.sessionId,
          transcriptCount: finalState.transcript.length,
          timelineCount: finalState.timeline.length,
          lastAssistant: lastAssistant?.content || null,
        },
        null,
        2,
      ),
    )
  } finally {
    await restoreSettingsSnapshot(originalSettings)
    await shutdownUi(uiUrl)
    await terminate(ui)
    await terminate(mock)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
