import http from 'http'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

export function resolveGatewayConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.GATEWAY_HOST || '127.0.0.1',
    port: Number.parseInt(
      String(overrides.port || process.env.GATEWAY_PORT || '8787'),
      10,
    ),
    upstreamBaseUrl:
      overrides.upstreamBaseUrl || process.env.OPENAI_COMPAT_BASE_URL || '',
    upstreamApiKey:
      overrides.upstreamApiKey || process.env.OPENAI_COMPAT_API_KEY || '',
    upstreamModel: overrides.upstreamModel || process.env.OPENAI_COMPAT_MODEL || '',
    upstreamChatPath:
      overrides.upstreamChatPath ||
      process.env.OPENAI_COMPAT_CHAT_PATH ||
      '/chat/completions',
    textMode:
      overrides.textMode || process.env.UPSTREAM_TEXT_MODE || 'openai',
  }
}

// ── Soul injection ──────────────────────────────────────
// Reads .claw/bootstrap/*.md from the workspace directory and caches the result.
// The content is prepended to the system prompt on every /v1/messages request,
// so that claw.exe's own system prompt doesn't override the user's SOUL.
let _soulCache = ''
let _soulLastRead = 0
const SOUL_CACHE_TTL = 5000 // Re-read every 5s (hot-reload)

function loadSoulPrefix(config) {
  const workspaceDir = config.workspaceDir || process.env.CLAW_WORKSPACE_DIR || ''
  if (!workspaceDir) return ''

  const now = Date.now()
  if (_soulCache && now - _soulLastRead < SOUL_CACHE_TTL) return _soulCache

  const bootstrapDir = path.join(workspaceDir, '.claw', 'bootstrap')
  const priority = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'CONTEXT.md']

  try {
    const files = fs.readdirSync(bootstrapDir).filter(f => f.endsWith('.md'))
    const sorted = [
      ...priority.filter(p => files.includes(p)),
      ...files.filter(f => !priority.includes(f)).sort(),
    ]

    let assembled = ''
    for (const name of sorted) {
      try {
        let content = fs.readFileSync(path.join(bootstrapDir, name), 'utf8')
        if (content.length > 20000) content = content.slice(0, 20000) + '\n[...truncated]'
        assembled += content + '\n\n'
        if (assembled.length > 80000) break
      } catch { /* skip */ }
    }
    _soulCache = assembled.trim()
    _soulLastRead = now
    return _soulCache
  } catch {
    return ''
  }
}

// ── Memory injection ────────────────────────────────────
// Reads .claw/memory/MEMORY.md index + topics/*.md + recent daily logs.
// Injected alongside SOUL into the system prompt.
let _memCache = ''
let _memLastRead = 0
const MEM_CACHE_TTL = 10000 // Re-read every 10s

function loadMemoryPrefix(config) {
  const workspaceDir = config.workspaceDir || process.env.CLAW_WORKSPACE_DIR || ''
  if (!workspaceDir) return ''

  const now = Date.now()
  if (_memCache && now - _memLastRead < MEM_CACHE_TTL) return _memCache

  const memDir = path.join(workspaceDir, '.claw', 'memory')
  const parts = []

  // 1. MEMORY.md index
  try {
    const index = fs.readFileSync(path.join(memDir, 'MEMORY.md'), 'utf8')
    if (index && !index.includes('暂无记忆')) {
      parts.push('## 长期记忆索引\n' + index.slice(0, 25000))
    }
  } catch { /* no index yet */ }

  // 2. All topic files (direct load, fast for <8 files)
  try {
    const topicsDir = path.join(memDir, 'topics')
    const files = fs.readdirSync(topicsDir).filter(f => f.endsWith('.md'))
    for (const name of files.slice(0, 10)) {
      try {
        const content = fs.readFileSync(path.join(topicsDir, name), 'utf8')
        if (content.length > 0) {
          parts.push('## 记忆: ' + name.replace('.md', '') + '\n' + content.slice(0, 5000))
        }
      } catch { /* skip */ }
    }
  } catch { /* no topics dir */ }

  // 3. Today's daily log (last 1500 chars only to save token budget)
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  const logPath = path.join(memDir, 'logs', String(y), m, `${y}-${m}-${dd}.md`)
  try {
    const log = fs.readFileSync(logPath, 'utf8')
    if (log) {
      // Only keep the last ~1500 chars (most recent entries)
      const trimmed = log.length > 1500 ? '...\n' + log.slice(-1500) : log
      parts.push('## 今日日志\n' + trimmed)
    }
  } catch { /* no log */ }

  _memCache = parts.length > 0 ? parts.join('\n\n') : ''
  _memLastRead = now
  return _memCache
}

export async function startGatewayServer(overrides = {}) {
  const config = resolveGatewayConfig(overrides)
  if (!config.upstreamBaseUrl) {
    throw new Error('OPENAI_COMPAT_BASE_URL is required')
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${config.host}:${config.port}`)
      const pathname = requestUrl.pathname

      if (req.method === 'GET' && pathname === '/health') {
        writeJson(res, 200, {
          ok: true,
          upstreamBaseUrl: config.upstreamBaseUrl,
          upstreamChatPath: config.upstreamChatPath,
        })
        return
      }

      if (req.method === 'POST' && pathname === '/v1/messages') {
        const body = await readJson(req)

        // ── Passthrough API key from request headers ──
        if (!config.upstreamApiKey) {
          const incomingKey = req.headers['x-api-key'] || ''
          if (incomingKey && incomingKey !== 'dummy' && incomingKey !== 'unused') {
            config = { ...config, upstreamApiKey: incomingKey }
          }
        }

        // ── Soul + Memory injection ──
        const soulPrefix = loadSoulPrefix(config)
        const memPrefix = loadMemoryPrefix(config)
        const injected = [soulPrefix, memPrefix].filter(Boolean).join('\n\n')
        if (injected) {
          const existing = typeof body.system === 'string' ? body.system : ''
          body.system = injected + (existing ? '\n\n' + existing : '')
        }

        if (config.textMode === 'anthropic') {
          await handleAnthropicPassthrough(body, res, config)
          return
        }
        if (config.textMode === 'gemini') {
          if (body.stream) {
            await handleGeminiStream(body, res, config)
          } else {
            await handleGeminiNonStream(body, res, config)
          }
          return
        }
        if (body.stream) {
          await handleStream(body, res, config)
        } else {
          await handleNonStream(body, res, config)
        }
        return
      }

      writeJson(res, 404, { error: { message: 'Not found' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeJson(res, 500, {
        error: {
          message,
        },
      })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : config.port
  const url = `http://${config.host}:${actualPort}`

  return {
    server,
    config: {
      ...config,
      port: actualPort,
    },
    url,
    async close() {
      await new Promise(resolve => server.close(resolve))
    },
  }
}

async function handleNonStream(body, res, config) {
  const upstreamBody = anthropicToOpenAI(body, false, config)
  const upstreamResponse = await fetch(
    joinUrl(config.upstreamBaseUrl, config.upstreamChatPath),
    {
      method: 'POST',
      headers: buildUpstreamHeaders(config),
      body: JSON.stringify(upstreamBody),
    },
  )

  const text = await upstreamResponse.text()
  if (!upstreamResponse.ok) {
    res.statusCode = upstreamResponse.status
    res.setHeader('content-type', 'application/json')
    res.end(text)
    return
  }

  const payload = JSON.parse(text)
  const anthropicMessage = openAINonStreamToAnthropic(body, payload)
  writeJson(res, 200, anthropicMessage)
}

async function handleStream(body, res, config) {
  const upstreamBody = anthropicToOpenAI(body, true, config)
  const upstreamResponse = await fetch(
    joinUrl(config.upstreamBaseUrl, config.upstreamChatPath),
    {
      method: 'POST',
      headers: buildUpstreamHeaders(config),
      body: JSON.stringify(upstreamBody),
    },
  )

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const text = await upstreamResponse.text()
    res.statusCode = upstreamResponse.status
    res.setHeader('content-type', 'application/json')
    res.end(text)
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  const state = {
    messageId: `msg_${crypto.randomUUID().replace(/-/g, '')}`,
    textStarted: false,
    textIndex: 0,
    text: '',
    finishReason: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    toolCalls: new Map(),
  }

  writeSse(res, 'message_start', {
    type: 'message_start',
    message: {
      id: state.messageId,
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: state.usage,
    },
  })

  const decoder = new TextDecoder('utf8')
  let buffer = ''

  for await (const chunk of upstreamResponse.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const dataLines = part
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())

      for (const data of dataLines) {
        if (!data || data === '[DONE]') {
          continue
        }

        const payload = JSON.parse(data)
        const choice = payload.choices?.[0]
        if (!choice) {
          continue
        }

        if (payload.usage) {
          state.usage = {
            input_tokens: payload.usage.prompt_tokens ?? state.usage.input_tokens,
            output_tokens:
              payload.usage.completion_tokens ?? state.usage.output_tokens,
          }
        }

        if (choice.delta?.content) {
          if (!state.textStarted) {
            state.textStarted = true
            writeSse(res, 'content_block_start', {
              type: 'content_block_start',
              index: state.textIndex,
              content_block: {
                type: 'text',
                text: '',
              },
            })
          }

          state.text += choice.delta.content
          writeSse(res, 'content_block_delta', {
            type: 'content_block_delta',
            index: state.textIndex,
            delta: {
              type: 'text_delta',
              text: choice.delta.content,
            },
          })
        }

        if (Array.isArray(choice.delta?.tool_calls)) {
          for (const toolDelta of choice.delta.tool_calls) {
            const key = String(toolDelta.index ?? 0)
            const current = state.toolCalls.get(key) ?? {
              id: toolDelta.id || `toolu_${crypto.randomUUID().replace(/-/g, '')}`,
              name: '',
              arguments: '',
              index: Number(toolDelta.index ?? 0),
            }

            if (toolDelta.id) {
              current.id = toolDelta.id
            }
            if (toolDelta.function?.name) {
              current.name = toolDelta.function.name
            }
            if (toolDelta.function?.arguments) {
              current.arguments += toolDelta.function.arguments
            }

            state.toolCalls.set(key, current)
          }
        }

        if (choice.finish_reason) {
          state.finishReason = choice.finish_reason
        }
      }
    }
  }

  if (state.textStarted) {
    writeSse(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: state.textIndex,
    })
  }

  const bufferedToolCalls = Array.from(state.toolCalls.values()).sort(
    (a, b) => a.index - b.index,
  )

  let nextIndex = state.textStarted ? 1 : 0
  for (const toolCall of bufferedToolCalls) {
    writeSse(res, 'content_block_start', {
      type: 'content_block_start',
      index: nextIndex,
      content_block: {
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: parseJsonObject(toolCall.arguments),
      },
    })
    writeSse(res, 'content_block_stop', {
      type: 'content_block_stop',
      index: nextIndex,
    })
    nextIndex += 1
  }

  writeSse(res, 'message_delta', {
    type: 'message_delta',
    delta: {
      stop_reason: mapFinishReason(state.finishReason, bufferedToolCalls.length > 0),
      stop_sequence: null,
    },
    usage: state.usage,
  })
  writeSse(res, 'message_stop', {
    type: 'message_stop',
  })
  res.end()
}

function anthropicToOpenAI(body, stream, config) {
  const messages = anthropicMessagesToOpenAI(body.messages ?? [], body.system)
  const tools = Array.isArray(body.tools)
    ? body.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters:
            tool.input_schema || {
              type: 'object',
              properties: {},
            },
        },
      }))
    : undefined

  return {
    model: config.upstreamModel || body.model,
    messages,
    tools,
    tool_choice: mapToolChoice(body.tool_choice),
    temperature: body.temperature,
    max_tokens: Math.min(body.max_tokens || 4096, 8192),
    stream,
    stream_options: stream ? { include_usage: true } : undefined,
  }
}

function anthropicMessagesToOpenAI(messages, system) {
  const result = []

  const systemText = flattenSystem(system)
  if (systemText) {
    result.push({
      role: 'system',
      content: systemText,
    })
  }

  for (const message of messages) {
    const blocks = normalizeBlocks(message.content)

    if (message.role === 'assistant') {
      const textParts = []
      const toolCalls = []

      for (const block of blocks) {
        if (block.type === 'text') {
          textParts.push(block.text || '')
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id || `toolu_${crypto.randomUUID().replace(/-/g, '')}`,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          })
        }
      }

      const assistantMsg = {
        role: 'assistant',
        content: textParts.join('\n') || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      }
      // Kimi's reasoning models (kimi-k2.5 etc.) require reasoning_content
      // on assistant messages that have tool_calls, otherwise they return 400.
      if (toolCalls.length > 0) {
        assistantMsg.reasoning_content = 'ok'
      }
      result.push(assistantMsg)
      continue
    }

    const userContent = []
    const toolMessages = []

    for (const block of blocks) {
      if (block.type === 'text') {
        userContent.push({
          type: 'text',
          text: block.text || '',
        })
      } else if (block.type === 'image') {
        const imageUrl = anthropicImageToDataUrl(block)
        if (imageUrl) {
          userContent.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
            },
          })
        }
      } else if (block.type === 'tool_result') {
        toolMessages.push({
          role: 'tool',
          tool_call_id: block.tool_use_id || '',
          content: flattenToolResult(block.content),
        })
      }
    }

    if (userContent.length > 0) {
      result.push({
        role: 'user',
        content:
          userContent.length === 1 && userContent[0].type === 'text'
            ? userContent[0].text
            : userContent,
      })
    }

    result.push(...toolMessages)
  }

  return result
}

function openAINonStreamToAnthropic(requestBody, payload) {
  const choice = payload.choices?.[0] ?? {}
  const message = choice.message ?? {}
  const content = []

  if (typeof message.content === 'string' && message.content.trim()) {
    content.push({
      type: 'text',
      text: message.content,
    })
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: toolCall.id || `toolu_${crypto.randomUUID().replace(/-/g, '')}`,
        name: toolCall.function?.name || 'tool',
        input: parseJsonObject(toolCall.function?.arguments),
      })
    }
  }

  return {
    id: payload.id || `msg_${crypto.randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    model: requestBody.model,
    content,
    stop_reason: mapFinishReason(
      choice.finish_reason,
      Array.isArray(message.tool_calls) && message.tool_calls.length > 0,
    ),
    stop_sequence: null,
    usage: {
      input_tokens: payload.usage?.prompt_tokens ?? 0,
      output_tokens: payload.usage?.completion_tokens ?? 0,
    },
  }
}

function flattenSystem(system) {
  if (!system) {
    return ''
  }
  if (typeof system === 'string') {
    return system
  }
  return normalizeBlocks(system)
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('\n')
}

function normalizeBlocks(content) {
  if (!content) {
    return []
  }
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (!Array.isArray(content)) {
    return []
  }
  return content
}

function flattenToolResult(content) {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') {
          return block
        }
        if (block?.type === 'text') {
          return block.text || ''
        }
        return JSON.stringify(block)
      })
      .join('\n') || 'tool_result'
  }
  if (content == null) {
    return 'tool_result'
  }
  return JSON.stringify(content)
}

function anthropicImageToDataUrl(block) {
  const source = block?.source
  if (!source) {
    return null
  }
  if (source.type === 'base64' && source.data && source.media_type) {
    return `data:${source.media_type};base64,${source.data}`
  }
  if (source.type === 'url' && source.url) {
    return source.url
  }
  return null
}

function mapToolChoice(toolChoice) {
  if (!toolChoice) {
    return undefined
  }
  if (toolChoice === 'auto' || toolChoice.type === 'auto') {
    return 'auto'
  }
  if (toolChoice === 'any' || toolChoice.type === 'any') {
    return 'required'
  }
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return {
      type: 'function',
      function: {
        name: toolChoice.name,
      },
    }
  }
  return undefined
}

function mapFinishReason(finishReason, hasToolCalls) {
  if (hasToolCalls || finishReason === 'tool_calls') {
    return 'tool_use'
  }
  if (finishReason === 'length') {
    return 'max_tokens'
  }
  if (finishReason === 'stop') {
    return 'end_turn'
  }
  return 'end_turn'
}

function parseJsonObject(input) {
  if (!input || typeof input !== 'string') {
    return {}
  }
  try {
    return JSON.parse(input)
  } catch {
    return {
      raw: input,
    }
  }
}

function buildUpstreamHeaders(config) {
  const headers = {
    'content-type': 'application/json',
  }

  if (config.upstreamApiKey) {
    headers.authorization = `Bearer ${config.upstreamApiKey}`
  }

  return headers
}

function joinUrl(base, maybePath) {
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base
  const normalizedPath = maybePath.startsWith('/') ? maybePath : `/${maybePath}`
  return `${normalizedBase}${normalizedPath}`
}

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

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

// ── Anthropic passthrough ──────────────────────────────────────────────

async function handleAnthropicPassthrough(body, res, config) {
  const upstreamUrl = joinUrl(config.upstreamBaseUrl, '/messages')
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
  if (config.upstreamApiKey) {
    headers['x-api-key'] = config.upstreamApiKey
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!upstreamResponse.ok && !body.stream) {
    const errText = await upstreamResponse.text()
    writeJson(res, upstreamResponse.status, {
      error: { message: errText || `Anthropic upstream returned ${upstreamResponse.status}` },
    })
    return
  }

  if (body.stream) {
    res.writeHead(upstreamResponse.status, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })
    try {
      for await (const chunk of upstreamResponse.body) {
        res.write(chunk)
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { message: String(err) } })}\n\n`)
    } finally {
      res.end()
    }
    return
  }

  const payload = await upstreamResponse.text()
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(payload)
}

// ── Gemini adapter ────────────────────────────────────────────────────

function anthropicToGeminiContents(messages) {
  const contents = []
  for (const msg of messages || []) {
    const role = msg.role === 'assistant' ? 'model' : 'user'
    const text = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .filter(b => b?.type === 'text')
            .map(b => b.text)
            .join('\n')
        : ''
    if (text) {
      contents.push({ role, parts: [{ text }] })
    }
  }
  return contents
}

function geminiResponseToAnthropic(geminiData, model) {
  const candidates = geminiData?.candidates || []
  const firstCandidate = candidates[0] || {}
  const parts = firstCandidate?.content?.parts || []
  const textParts = parts
    .filter(p => typeof p.text === 'string')
    .map(p => p.text)
    .join('')

  const content = textParts
    ? [{ type: 'text', text: textParts }]
    : [{ type: 'text', text: '' }]

  const finishReason = firstCandidate.finishReason || 'STOP'
  const stopReason = finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn'

  const usage = geminiData?.usageMetadata || {}

  return {
    id: `msg_gemini_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: model || 'gemini',
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: usage.promptTokenCount || 0,
      output_tokens: usage.candidatesTokenCount || 0,
    },
  }
}

function buildGeminiUrl(config, model, stream = false) {
  const base = config.upstreamBaseUrl.replace(/\/+$/, '')
  const action = stream ? 'streamGenerateContent' : 'generateContent'
  let url = `${base}/models/${model}:${action}`
  if (config.upstreamApiKey) {
    url += `?key=${encodeURIComponent(config.upstreamApiKey)}`
    if (stream) url += '&alt=sse'
  } else if (stream) {
    url += '?alt=sse'
  }
  return url
}

async function handleGeminiNonStream(body, res, config) {
  const model = body.model || config.upstreamModel
  const contents = anthropicToGeminiContents(body.messages)
  const systemText = typeof body.system === 'string'
    ? body.system
    : Array.isArray(body.system)
      ? body.system.filter(b => b?.type === 'text').map(b => b.text).join('\n')
      : ''

  const geminiBody = {
    contents,
    generationConfig: {
      temperature: body.temperature ?? 0.8,
      maxOutputTokens: body.max_tokens || 4096,
    },
  }
  if (systemText) {
    geminiBody.systemInstruction = { parts: [{ text: systemText }] }
  }

  const url = buildGeminiUrl(config, model, false)
  const upstreamResponse = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(geminiBody),
  })

  if (!upstreamResponse.ok) {
    const errText = await upstreamResponse.text()
    writeJson(res, upstreamResponse.status, {
      error: { message: errText || `Gemini returned ${upstreamResponse.status}` },
    })
    return
  }

  const geminiData = await upstreamResponse.json()
  const anthropicResponse = geminiResponseToAnthropic(geminiData, model)
  writeJson(res, 200, anthropicResponse)
}

async function handleGeminiStream(body, res, config) {
  const model = body.model || config.upstreamModel
  const contents = anthropicToGeminiContents(body.messages)
  const systemText = typeof body.system === 'string'
    ? body.system
    : Array.isArray(body.system)
      ? body.system.filter(b => b?.type === 'text').map(b => b.text).join('\n')
      : ''

  const geminiBody = {
    contents,
    generationConfig: {
      temperature: body.temperature ?? 0.8,
      maxOutputTokens: body.max_tokens || 4096,
    },
  }
  if (systemText) {
    geminiBody.systemInstruction = { parts: [{ text: systemText }] }
  }

  const url = buildGeminiUrl(config, model, true)
  const upstreamResponse = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(geminiBody),
  })

  if (!upstreamResponse.ok) {
    const errText = await upstreamResponse.text()
    writeJson(res, upstreamResponse.status, {
      error: { message: errText || `Gemini stream returned ${upstreamResponse.status}` },
    })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  })

  const messageId = `msg_gemini_${crypto.randomUUID()}`
  writeSse(res, 'message_start', {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  })
  writeSse(res, 'content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  })

  if (!upstreamResponse.body) {
    writeSse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
    writeSse(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: 0 },
    })
    writeSse(res, 'message_stop', { type: 'message_stop' })
    res.end()
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let totalOutputTokens = 0
  let inputTokens = 0

  try {
    for await (const value of upstreamResponse.body) {
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const jsonStr = line.slice(6).trim()
        if (!jsonStr || jsonStr === '[DONE]') continue

        try {
          const chunk = JSON.parse(jsonStr)
          const parts = chunk?.candidates?.[0]?.content?.parts || []
          for (const part of parts) {
            if (typeof part.text === 'string' && part.text) {
              writeSse(res, 'content_block_delta', {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: part.text },
              })
            }
          }
          const usage = chunk?.usageMetadata
          if (usage) {
            if (usage.promptTokenCount) inputTokens = usage.promptTokenCount
            if (usage.candidatesTokenCount) totalOutputTokens = usage.candidatesTokenCount
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  } finally {
    writeSse(res, 'content_block_stop', { type: 'content_block_stop', index: 0 })
    writeSse(res, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: totalOutputTokens },
    })
    writeSse(res, 'message_stop', { type: 'message_stop' })
    res.end()
  }
}

function isMainModule() {
  const currentFile = fileURLToPath(import.meta.url)
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : ''
  return currentFile === entry
}

if (isMainModule()) {
  startGatewayServer()
    .then(({ url, config }) => {
      console.log(`Anthropic-compatible gateway listening at ${url}`)
      console.log(
        `Upstream chat completions URL: ${joinUrl(
          config.upstreamBaseUrl,
          config.upstreamChatPath,
        )}`,
      )
    })
    .catch(error => {
      console.error(error instanceof Error ? error.stack || error.message : String(error))
      process.exitCode = 1
    })
}
