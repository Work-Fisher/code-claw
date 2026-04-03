import http from 'http'
import os from 'os'
import path from 'path'
import { promises as fs } from 'fs'
import { runPromptOnce } from '../compatible-shell/src/cli.mjs'
import { startGatewayServer } from '../tools/model-gateway/server.mjs'

async function main() {
  const upstreamPort = await getFreePort()
  const workspaceDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'compatible-shell-smoke-'),
  )
  await fs.writeFile(
    path.join(workspaceDir, 'hello.txt'),
    'hello from smoke test\n',
    'utf8',
  )

  let requestCount = 0
  const upstreamServer = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/chat/completions') {
      res.writeHead(404)
      res.end()
      return
    }

    const body = await readJson(req)
    requestCount += 1

    if (requestCount === 1) {
      writeJson(res, {
        id: 'chatcmpl_smoke_tool',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_read_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: JSON.stringify({ path: 'hello.txt' }),
                  },
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
        },
      })
      return
    }

    const toolMessage = [...(body.messages || [])]
      .reverse()
      .find(message => message.role === 'tool')
    const toolContent =
      typeof toolMessage?.content === 'string' ? toolMessage.content.trim() : 'missing'

    writeJson(res, {
      id: 'chatcmpl_smoke_final',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: `compatible shell smoke ok: ${toolContent}`,
          },
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
      },
    })
  })

  await new Promise(resolve => upstreamServer.listen(upstreamPort, '127.0.0.1', resolve))

  const gateway = await startGatewayServer({
    host: '127.0.0.1',
    port: 0,
    upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}`,
    upstreamModel: 'smoke-model',
  })

  try {
    const result = await runPromptOnce({
      cwd: workspaceDir,
      prompt: 'What is in hello.txt?',
      baseUrl: gateway.url,
      apiKey: 'dummy',
      model: 'compatible-smoke',
      noSave: true,
    })

    const lastAssistantMessage = [...result.messages]
      .reverse()
      .find(message => message.role === 'assistant')
    const lastText = lastAssistantMessage?.content
      ?.filter(block => block.type === 'text')
      ?.map(block => block.text)
      ?.join('\n')

    if (!lastText || !lastText.includes('compatible shell smoke ok:')) {
      throw new Error(
        `Smoke output missing success marker. Last assistant text: ${lastText || '<empty>'}`,
      )
    }

    console.log('Compatible shell smoke test passed.')
    console.log(lastText)
  } finally {
    await gateway.close()
    await new Promise(resolve => upstreamServer.close(resolve))
    await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {})
  }
}

function writeJson(res, data) {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(data))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

async function getFreePort() {
  const server = http.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise(resolve => server.close(resolve))
  return port
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
