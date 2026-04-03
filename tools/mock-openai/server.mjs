import http from 'http'
import crypto from 'crypto'

const host = process.env.MOCK_OPENAI_HOST || '127.0.0.1'
const port = Number.parseInt(process.env.MOCK_OPENAI_PORT || '8790', 10)

function writeJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
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

function writeSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function lastUserMessage(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'user') {
      if (typeof message.content === 'string') {
        return message.content
      }
      if (Array.isArray(message.content)) {
        return message.content
          .map(part => {
            if (typeof part === 'string') return part
            if (part?.type === 'text') return part.text || ''
            return ''
          })
          .join('\n')
      }
    }
  }
  return ''
}

function buildAnswer(body) {
  const prompt = lastUserMessage(body.messages)
  const toolInfo = Array.isArray(body.tools) && body.tools.length > 0
    ? `，当前暴露工具数 ${body.tools.length}`
    : ''
  return `Recovered Claude mock 已连通。你刚才说的是：${prompt || '（空输入）'}${toolInfo}。`
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/chat/completions') {
    const body = await readJson(req)
    console.log(
      `[mock-openai] ${req.method} ${req.url} model=${body.model || ''} stream=${String(body.stream)}`,
    )
    const text = buildAnswer(body)

    if (body.stream) {
      const id = `chatcmpl_${crypto.randomUUID().replace(/-/g, '')}`
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      })

      writeSse(res, {
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      })

      for (const chunk of text.match(/.{1,18}/g) || [text]) {
        writeSse(res, {
          id,
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
        })
      }

      writeSse(res, {
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 32,
          completion_tokens: Math.max(8, Math.ceil(text.length / 2)),
        },
      })
      res.end('data: [DONE]\n\n')
      return
    }

    writeJson(res, 200, {
      id: `chatcmpl_${crypto.randomUUID().replace(/-/g, '')}`,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: text,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 32,
        completion_tokens: Math.max(8, Math.ceil(text.length / 2)),
      },
    })
    return
  }

  writeJson(res, 404, { error: { message: 'Not found' } })
})

server.listen(port, host, () => {
  console.log(`Mock OpenAI-compatible server listening at http://${host}:${port}`)
})
