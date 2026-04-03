import http from 'node:http'
import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = process.env.CLAW_ROOT_DIR || resolve(__dirname, '..', '..')
const publicDir = resolve(
  process.env.CLAW_UI_PUBLIC_DIR || join(rootDir, 'ai-code-studio', 'dist'),
)
const dataDir = process.env.CLAW_DATA_DIR || join(__dirname, 'data')
const configPath = join(dataDir, 'settings.json')
const appSessionsPath = join(dataDir, 'app-sessions.json')
const runtimeStatePath = join(dataDir, 'runtime-state.json')
const gatewayScript = join(rootDir, 'tools', 'model-gateway', 'server.mjs')

const uiHost = process.env.CLAW_UI_HOST || '127.0.0.1'
const uiPort = Number.parseInt(process.env.CLAW_UI_PORT || '8891', 10)
const sseClients = new Set()
const contextMessageLimit = 10

/* ── Proxy detection (for claw.exe WebSearch) ───────────── */
import { execSync } from 'node:child_process'

let _cachedProxy = undefined
function detectProxy() {
  if (_cachedProxy !== undefined) return _cachedProxy

  // 1. Check existing env vars
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy || ''
  if (envProxy) {
    _cachedProxy = envProxy
    return _cachedProxy
  }

  // 2. On Windows, read system proxy from registry
  if (process.platform === 'win32') {
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
        { encoding: 'utf8', timeout: 3000 },
      )
      const match = out.match(/ProxyServer\s+REG_SZ\s+(.+)/)
      if (match) {
        const server = match[1].trim()
        _cachedProxy = server.startsWith('http') ? server : `http://${server}`
        return _cachedProxy
      }
    } catch { /* no system proxy */ }
  }

  _cachedProxy = ''
  return _cachedProxy
}

/* ── Bootstrap (soul / personality injection) ───────────── */
import {
  initBootstrap,
  getBootstrap,
  loadBootstrapChain,
  watchBootstrap,
  listBootstrapFiles,
  saveBootstrapFile,
  deleteBootstrapFile,
} from './bootstrap.mjs'

/* ── Memory (cross-session persistent memory) ───────── */
import {
  initMemory,
  buildMemoryContext,
  appendDailyLog,
  getMemoryOverview,
  loadMemoryFiles,
  saveMemoryFile,
  deleteMemoryFile,
  findRelevantMemories,
  scanMemoryManifest,
  shouldRunDream as memoryShouldRunDream,
  runDream as memoryRunDream,
} from './memory.mjs'

/* ── Skill loader ────────────────────────────────────────── */
const loadedSkills = new Map()

async function loadSkills(workspaceDir) {
  loadedSkills.clear()
  if (!workspaceDir) return
  const dirs = [
    { base: join(workspaceDir, '.claude', 'skills'), pattern: 'dir' },
    { base: join(workspaceDir, '.claude', 'commands'), pattern: 'file' },
  ]
  for (const { base, pattern } of dirs) {
    try { await access(base, fsConstants.R_OK) } catch { continue }
    const entries = await readdir(base, { withFileTypes: true })
    for (const entry of entries) {
      try {
        let content
        if (pattern === 'dir' && entry.isDirectory()) {
          content = await readFile(join(base, entry.name, 'SKILL.md'), 'utf8')
        } else if (pattern === 'file' && entry.name.endsWith('.md')) {
          content = await readFile(join(base, entry.name), 'utf8')
        } else continue
        const skill = parseSkillFrontmatter(content, entry.name.replace(/\.md$/, ''))
        if (skill) loadedSkills.set(skill.name, skill)
      } catch { /* skip unreadable */ }
    }
  }
  pushLog('ui', `已加载 ${loadedSkills.size} 个 skill`, 'info')
}

function parseSkillFrontmatter(content, fallbackName) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
  if (!match) return { name: fallbackName, description: '', body: content.trim(), source: 'file' }
  const meta = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return {
    name: meta.name || fallbackName,
    description: meta.description || '',
    body: match[2].trim(),
    source: 'file',
  }
}

function resolveSkillPrompt(prompt) {
  const m = prompt.match(/^\/(\S+)\s*(.*)$/s)
  if (!m) return null
  const skill = loadedSkills.get(m[1])
  if (!skill) return null
  const args = m[2].trim()
  return { skill, injectedPrompt: skill.body + (args ? '\n\nARGUMENTS: ' + args : '') }
}

/* ── MagicDocs ───────────────────────────────────────────── */
const magicDocLastUpdated = new Map()
const MAGIC_DOC_COOLDOWN_MS = 10 * 60 * 1000

async function scanMagicDocs(dir, depth = 0) {
  const results = []
  if (depth > 3) return results
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...await scanMagicDocs(full, depth + 1))
      } else if (entry.name.endsWith('.md')) {
        try {
          const text = await readFile(full, 'utf8')
          const hm = text.match(/^#\s*MAGIC\s+DOC:\s*(.+)$/im)
          if (hm) {
            const afterHeader = text.slice(hm.index + hm[0].length)
            const instrMatch = afterHeader.match(/^\s*\n(?:\s*\n)?[_*](.+?)[_*]/)
            results.push({ path: full, title: hm[1].trim(), instructions: instrMatch?.[1]?.trim() })
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results
}

async function callGatewayLLM(systemPrompt, userPrompt) {
  const gatewayUrl = state.gateway?.url
  if (!gatewayUrl) {
    pushLog('ui', '[记忆] Gateway 未就绪，无法调用 LLM', 'warn')
    return null
  }
  try {
    pushLog('ui', `[记忆] 正在通过 Gateway 调用 LLM (${state.config.upstreamModel || 'default'})...`)
    const res = await fetch(`${gatewayUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': state.config.upstreamApiKey || 'unused',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: state.config.upstreamModel || 'default',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      pushLog('ui', `[记忆] LLM 请求失败: HTTP ${res.status} — ${errBody.slice(0, 300)}`, 'warn')
      return null
    }
    const data = await res.json()
    const text = data?.content?.[0]?.text || null
    if (!text) {
      pushLog('ui', `[记忆] LLM 返回了空内容，响应: ${JSON.stringify(data).slice(0, 300)}`, 'warn')
    }
    return text
  } catch (e) {
    pushLog('ui', `[记忆] LLM 调用异常: ${e.message}`, 'error')
    return null
  }
}

async function updateMagicDoc(doc, transcript) {
  const now = Date.now()
  const lastAt = magicDocLastUpdated.get(doc.path) || 0
  if (now - lastAt < MAGIC_DOC_COOLDOWN_MS) return
  magicDocLastUpdated.set(doc.path, now)

  const currentContent = await readFile(doc.path, 'utf8').catch(() => null)
  if (!currentContent) return

  const recentChat = transcript.slice(-6).map(e => `${e.role}: ${e.content?.slice(0, 500) || ''}`).join('\n')
  if (!recentChat.trim()) return

  const systemPrompt = `你是一个文档维护助手。根据最近的对话内容，更新 Magic Doc 文件。
规则：
- 保留文件头 "# MAGIC DOC: ${doc.title}" 不变
- 只更新有实质新信息的部分
- 删除过时内容
- 保持简洁，高信号密度
- 如果没有需要更新的内容，原样返回文档
${doc.instructions ? `- 自定义指令: ${doc.instructions}` : ''}`

  const userPrompt = `当前文档内容：
<doc>
${currentContent}
</doc>

最近对话：
<conversation>
${recentChat}
</conversation>

请返回更新后的完整文档内容（不要用代码块包裹）。如果无需更新，原样返回。`

  const result = await callGatewayLLM(systemPrompt, userPrompt)
  if (!result || result.length < 10) return
  if (!result.match(/^#\s*MAGIC\s+DOC:/im)) return

  await writeFile(doc.path, result, 'utf8')
  pushLog('ui', `已更新 Magic Doc: ${doc.title}`, 'info')
  broadcast({ type: 'timeline_upsert', entry: { id: `magic-${Date.now()}`, kind: 'status', status: 'success', title: `已更新文档: ${doc.title}`, content: '', timestamp: new Date().toISOString() } })
}

async function runMagicDocsHook() {
  try {
    const workspaceDir = state.config.workspaceDir
    if (!workspaceDir) return
    const docs = await scanMagicDocs(workspaceDir)
    if (docs.length === 0) return
    const transcript = state.transcript || []
    for (const doc of docs) {
      await updateMagicDoc(doc, transcript)
    }
  } catch (err) {
    pushLog('ui', `MagicDocs 更新失败: ${err.message}`, 'warn')
  }
}

/* ── autoDream (memory consolidation) — delegated to memory.mjs ── */
const DREAM_CHECK_INTERVAL_MS = 15 * 60 * 1000
let dreamTimer = null

async function checkAndRunDream() {
  try {
    const workspaceDir = state.config.workspaceDir
    if (!workspaceDir) return
    const gatewayReady = !!state.gateway?.url
    const canDream = await memoryShouldRunDream(workspaceDir, state.run.status, gatewayReady, appSessionsPath)
    if (canDream) {
      const result = await memoryRunDream(workspaceDir, appSessionsPath, callGatewayLLM, pushLog)
      if (result?.ok) {
        broadcast({ type: 'timeline_upsert', entry: { id: `dream-${Date.now()}`, kind: 'status', status: 'success', title: result.summary || '记忆整合完成', content: '', timestamp: new Date().toISOString() } })
      }
    }
  } catch { /* silent */ }
}
const contextCharLimit = 6000
const contextEntryCharLimit = 1200

const state = {
  status: 'idle',
  gateway: { status: 'stopped', url: null, configKey: null },
  run: {
    status: 'idle',
    sessionId: null,
    resumeSessionId: null,
    currentPrompt: '',
    startedAt: null,
    endedAt: null,
    exitCode: null,
    outputFormat: 'json',
    model: null,
    cwd: null,
    permissionMode: null,
    contextMode: 'fresh',
    contextMessageCount: 0,
    carriedMessageCount: 0,
    transcriptSource: 'live',
    availableTools: [],
    queue: [],
    pendingApproval: null,
    lastResult: null,
  },
  config: {
    upstreamBaseUrl: '',
    upstreamApiKey: '',
    upstreamModel: '',
    clawModel: 'sonnet',
    textMode: 'openai',
    workspaceDir: rootDir,
    clawProjectDir: join(rootDir, 'claw-code'),
    clawBinaryPath: '',
    gatewayHost: '127.0.0.1',
    gatewayPort: 8787,
    permissionMode: 'workspace-write',
    runner: 'auto',
    outputFormat: 'json',
  },
  sessions: {
    status: 'idle',
    items: [],
    selectedSessionId: null,
    lastLoadedAt: null,
    error: null,
  },
  transcript: [],
  toolCalls: [],
  timeline: [],
  logs: [],
}

let gatewayChild = null
let clawChild = null
let pendingStop = false
const runQueue = []
let pendingApprovalRequest = null
let persistentHost = null

function safeNow() {
  return new Date().toISOString()
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function trimArray(list, limit) {
  while (list.length > limit) {
    list.shift()
  }
}

function upsertRecord(list, entry, idKey = 'id') {
  const id = entry[idKey]
  const index = list.findIndex(item => item[idKey] === id)
  if (index >= 0) {
    list[index] = {
      ...list[index],
      ...entry,
    }
    return list[index]
  }
  list.push(entry)
  return entry
}

function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

function formatUserFacingError(message) {
  const text = stripAnsi(String(message || '')).trim()
  if (!text) {
    return '运行失败，请查看运行日志了解详情。'
  }

  if (
    /selected model is at capacity|try a different model|model is overloaded|overloaded|capacity/i.test(
      text,
    )
  ) {
    return '上游模型当前已满载。本地链路已经连通，但 provider 现在比较繁忙。请稍后重试，或切换到其他上游模型。'
  }

  if (/rate limit|too many requests|quota/i.test(text)) {
    return '上游 provider 对当前请求进行了限流。请稍等片刻，降低请求频率，或切换 API Key / 模型。'
  }

  if (/invalid api key|incorrect api key|unauthorized|401/i.test(text)) {
    return '上游 API Key 被拒绝了。请在配置里检查 API Key，并确认它与当前 provider 匹配。'
  }

  if (/model.*not found|unknown model|does not exist|404/i.test(text)) {
    return '上游模型名称未被接受。请在配置面板里重新检查模型字符串。'
  }

  if (/timed out|timeout|etimedout/i.test(text)) {
    return '上游请求超时。当前 provider 或网络可能较慢，请稍后重试。'
  }

  if (/fetch failed|enotfound|econnrefused|connection refused|network/i.test(text)) {
    return '应用无法连接到上游接口。请检查接口地址、网络连接，以及 provider 是否可达。'
  }

  return text
}

function previewValue(value, max = 900) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) || ''
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}\n...`
}

function flattenBlockText(content) {
  if (typeof content === 'string') {
    return content
  }
  if (!Array.isArray(content)) {
    return ''
  }
  return content
    .map(block => {
      if (typeof block === 'string') {
        return block
      }
      if (block?.type === 'text' && typeof block.text === 'string') {
        return block.text
      }
      return JSON.stringify(block)
    })
    .join('\n')
    .trim()
}

function trimContextText(value, max = contextEntryCharLimit) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max)}\n[truncated]`
}

function extractVisibleUserPrompt(content) {
  const text = String(content || '').trim()
  if (!text) {
    return ''
  }

  const match = text.match(/<new_request>\s*([\s\S]*?)\s*<\/new_request>/i)
  if (match?.[1]) {
    return match[1].trim()
  }

  return text
}

function listConversationEntries(transcript) {
  return Array.isArray(transcript)
    ? transcript
        .filter(
          entry =>
            (entry?.role === 'user' || entry?.role === 'assistant') &&
            typeof entry?.content === 'string' &&
            entry.content.trim() &&
            !entry.isError,
        )
        .map(entry => ({
          ...entry,
          content:
            entry.role === 'user'
              ? extractVisibleUserPrompt(entry.content)
              : String(entry.content || '').trim(),
        }))
        .filter(entry => entry.content)
    : []
}

function countConversationEntries(transcript) {
  return listConversationEntries(transcript).length
}

function latestTranscriptTimestamp(transcript, fallback = Date.now()) {
  const timestamps = Array.isArray(transcript)
    ? transcript
        .map(entry => Date.parse(entry?.timestamp || ''))
        .filter(value => Number.isFinite(value))
    : []

  if (timestamps.length === 0) {
    return fallback
  }

  return Math.max(...timestamps)
}

function restampTranscriptEntries(entries, startAt) {
  let cursor = Math.max(Number.isFinite(startAt) ? startAt : Date.now(), Date.now())

  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    ...entry,
    timestamp: new Date(cursor + (index + 1) * 1000).toISOString(),
  }))
}

async function buildPromptWithCarryOver(transcript, prompt) {
  const conversation = listConversationEntries(transcript)

  // ── Bootstrap (soul / identity / context) injection ──
  const bootstrap = getBootstrap()

  const systemBlock = bootstrap
    ? `<system_context>\n${bootstrap}\n</system_context>\n\n`
    : ''

  if (conversation.length === 0) {
    return {
      runnerPrompt: systemBlock + prompt,
      usedEntries: [],
      active: false,
    }
  }

  const usedEntries = []
  let totalChars = 0

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const entry = conversation[index]
    const label = entry.role === 'user' ? 'User' : 'Assistant'
    const content = trimContextText(entry.content)
    const nextSize = totalChars + label.length + content.length + 8

    if (
      usedEntries.length > 0 &&
      (usedEntries.length >= contextMessageLimit || nextSize > contextCharLimit)
    ) {
      break
    }

    usedEntries.unshift({
      role: entry.role,
      label,
      content,
    })
    totalChars = nextSize
  }

  const renderedConversation = usedEntries
    .map(entry => `${entry.label}: ${entry.content}`)
    .join('\n\n')

  return {
    runnerPrompt: [
      systemBlock + 'Continue the same conversation using the recent transcript below as working context.',
      'Use it as background only and answer the new request directly.',
      '',
      '<recent_conversation>',
      renderedConversation,
      '</recent_conversation>',
      '',
      '<new_request>',
      prompt,
      '</new_request>',
    ].join('\n'),
    usedEntries,
    active: usedEntries.length > 0,
  }
}

function normalizeConfig(input = {}) {
  const next = { ...state.config, ...input }
  const runner = ['auto', 'cargo', 'binary'].includes(next.runner)
    ? next.runner
    : 'auto'
  const permissionMode = [
    'read-only',
    'workspace-write',
    'danger-full-access',
  ].includes(next.permissionMode)
    ? next.permissionMode
    : 'workspace-write'
  const textMode = ['openai', 'anthropic', 'gemini'].includes(next.textMode)
    ? next.textMode
    : 'openai'

  return {
    upstreamBaseUrl: String(next.upstreamBaseUrl || ''),
    upstreamApiKey: String(next.upstreamApiKey || ''),
    upstreamModel: String(next.upstreamModel || ''),
    clawModel: String(next.clawModel || 'sonnet'),
    textMode,
    workspaceDir: String(next.workspaceDir || rootDir),
    clawProjectDir: String(next.clawProjectDir || join(rootDir, 'claw-code')),
    clawBinaryPath: String(next.clawBinaryPath || ''),
    gatewayHost: String(next.gatewayHost || '127.0.0.1'),
    gatewayPort: Number.parseInt(String(next.gatewayPort || 8787), 10) || 8787,
    permissionMode,
    runner,
    outputFormat: 'json',
    enableSoulInjection: next.enableSoulInjection !== false,
    channels: next.channels || {},
  }
}

function previewPrompt(prompt, max = 140) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return ''
  }
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

function normalizeTerminalText(value) {
  return stripAnsi(String(value || '')).replace(/\r/g, '\n')
}

function countReplPrompts(value) {
  const matches = normalizeTerminalText(value).match(/(?:^|\n)> /g)
  return matches ? matches.length : 0
}

function trimReplOutput(value) {
  return normalizeTerminalText(value)
    .replace(/(?:^|\n)> $/, '')
    .trim()
}

async function waitForCondition(
  predicate,
  { timeoutMs = 15000, intervalMs = 120, errorMessage = '等待操作超时。' } = {},
) {
  const deadline = Date.now() + timeoutMs
  let lastError = null

  while (Date.now() < deadline) {
    try {
      const result = await predicate()
      if (result) {
        return result
      }
    } catch (error) {
      lastError = error
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs))
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error(errorMessage)
}

function summarizeQueuedRun(item) {
  return {
    id: item.id,
    sessionId: item.sessionId || null,
    promptPreview: previewPrompt(item.prompt),
    createdAt: item.createdAt,
    permissionMode: item.config.permissionMode,
  }
}

function summarizePendingApproval(item) {
  if (!item?.approval) {
    return null
  }
  return {
    id: item.id,
    sessionId: item.sessionId || null,
    promptPreview: previewPrompt(item.prompt),
    createdAt: item.createdAt,
    riskLevel: item.approval.riskLevel,
    title: item.approval.title,
    reasons: item.approval.reasons,
    permissionMode: item.config.permissionMode,
  }
}

function syncQueuedState() {
  state.run.queue = runQueue.map(summarizeQueuedRun)
  state.run.pendingApproval = summarizePendingApproval(pendingApprovalRequest)
}

function runDangerSignals(prompt) {
  const text = String(prompt || '')
  const patterns = [
    /rm\s+-rf/i,
    /git\s+reset\s+--hard/i,
    /remove-item\b/i,
    /\bdel\s+\/f\b/i,
    /format\s+[a-z]:/i,
    /drop\s+table/i,
    /删除|移除|清空|抹掉|格式化|强制覆盖|重置仓库|卸载/i,
  ]
  return patterns.some(pattern => pattern.test(text))
}

function workspaceLooksBroad(workspaceDir) {
  const normalized = resolve(String(workspaceDir || ''))
  const root = resolve(pathRoot(normalized))
  if (normalized === root) {
    return true
  }
  const parts = normalized.split(/[/\\]+/).filter(Boolean)
  return parts.length <= 1
}

function pathRoot(target) {
  const resolved = resolve(target)
  const match = resolved.match(/^[A-Za-z]:[\\/]/)
  if (match) {
    return match[0]
  }
  return resolved.startsWith('/') ? '/' : resolved
}

function getApprovalRequirement({ prompt, config, workspaceDir }) {
  const reasons = []
  let riskLevel = 'medium'

  if (config.permissionMode === 'danger-full-access') {
    reasons.push('当前权限模式是“完全访问”，运行时可以越过工作区边界读写本机文件。')
    riskLevel = 'high'
  }

  if (runDangerSignals(prompt)) {
    reasons.push('这条请求里包含删除、重置或强制覆盖等高风险操作信号。')
    riskLevel = config.permissionMode === 'danger-full-access' ? 'high' : 'medium'
  }

  if (workspaceLooksBroad(workspaceDir) && config.permissionMode !== 'read-only') {
    reasons.push('当前工作区范围过大，误操作时可能影响到不止一个项目。')
    riskLevel = config.permissionMode === 'danger-full-access' ? 'high' : riskLevel
  }

  if (reasons.length === 0) {
    return null
  }

  return {
    riskLevel,
    title: riskLevel === 'high' ? '高风险运行需要确认' : '运行前建议确认',
    reasons,
  }
}

function createRunRequest(body, config) {
  const prompt = String(body.prompt || '').trim()
  const workspaceDir = resolve(config.workspaceDir)
  return {
    id: createId('queued-run'),
    prompt,
    config,
    workspaceDir,
    sessionId: state.sessions.selectedSessionId || state.run.sessionId || null,
    createdAt: safeNow(),
    approval: getApprovalRequirement({ prompt, config, workspaceDir }),
  }
}

function snapshotState() {
  syncQueuedState()
  return {
    status: state.status,
    gateway: state.gateway,
    run: state.run,
    config: state.config,
    sessions: state.sessions,
    transcript: state.transcript,
    toolCalls: state.toolCalls,
    timeline: state.timeline,
    logs: state.logs,
  }
}

async function buildDiagnosticsReport() {
  syncQueuedState()
  const preferredBinaryPath = resolvePreferredBinaryPath(state.config)
  const [workspaceType, clawProjectType, clawBinaryType, items] = await Promise.all([
    pathType(state.config.workspaceDir),
    pathType(state.config.clawProjectDir),
    pathType(preferredBinaryPath),
    listAppSessions(state.config.workspaceDir),
  ])

  const selectedSession =
    items.find(item => item.sessionId === state.sessions.selectedSessionId) || null
  const changedFiles = Array.from(
    new Set(
      state.toolCalls.flatMap(call =>
        Array.isArray(call.diff?.files) ? call.diff.files.map(file => file.filePath) : [],
      ),
    ),
  ).length
  const failedTools = state.toolCalls.filter(call => call.status === 'error').length
  const lastTool =
    state.toolCalls.length > 0
      ? state.toolCalls[0]?.title || state.toolCalls[0]?.name || null
      : null

  return {
    generatedAt: safeNow(),
    gateway: {
      status: state.gateway.status,
      url: state.gateway.url,
    },
    run: {
      status: state.run.status,
      sessionId: state.run.sessionId,
      resumeSessionId: state.run.resumeSessionId,
      model: state.run.model,
      cwd: state.run.cwd,
      permissionMode: state.run.permissionMode,
      contextMessageCount: state.run.contextMessageCount || 0,
      carriedMessageCount: state.run.carriedMessageCount || 0,
      startedAt: state.run.startedAt,
      endedAt: state.run.endedAt,
      queueCount: runQueue.length,
      pendingApproval: summarizePendingApproval(pendingApprovalRequest),
    },
    config: {
      runner: state.config.runner,
      workspaceDir: state.config.workspaceDir,
      clawProjectDir: state.config.clawProjectDir,
      clawBinaryPath: state.config.clawBinaryPath,
      gatewayHost: state.config.gatewayHost,
      gatewayPort: state.config.gatewayPort,
    },
    paths: {
      workspaceDir: state.config.workspaceDir,
      workspaceType,
      clawProjectDir: state.config.clawProjectDir,
      clawProjectType,
      clawBinaryPath: preferredBinaryPath,
      clawBinaryType,
    },
    sessions: {
      total: items.length,
      selectedSessionId: state.sessions.selectedSessionId,
      running: items.filter(item => item.runStatus === 'running').length,
      failed: items.filter(item => item.runStatus === 'failed').length,
      interrupted: items.filter(item => item.runStatus === 'interrupted').length,
      completed: items.filter(item => item.runStatus === 'completed').length,
      stopped: items.filter(item => item.runStatus === 'stopped').length,
    },
    tools: {
      total: state.toolCalls.length,
      failed: failedTools,
      changedFiles,
      lastToolName: lastTool,
    },
    selectedSession: {
      sessionId: selectedSession?.sessionId || null,
      summary: selectedSession?.summary || null,
      runStatus: selectedSession?.runStatus || null,
      runMessage: selectedSession?.runMessage || null,
      lastModified: selectedSession?.lastModified || null,
    },
    logs: {
      total: state.logs.length,
      recent: state.logs.slice(-12),
    },
  }
}

function broadcast(payload) {
  const body = `data: ${JSON.stringify(payload)}\n\n`
  for (const res of sseClients) {
    res.write(body)
  }
}

function updateState(mutator) {
  mutator(state)
  broadcast({ type: 'state', state: snapshotState() })
}

function pushLog(source, text, level = 'info') {
  const lines = String(text)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)

  for (const line of lines) {
    const entry = {
      id: createId('log'),
      source,
      level,
      text: line,
      timestamp: safeNow(),
    }
    state.logs.push(entry)
    trimArray(state.logs, 700)
    broadcast({ type: 'log', entry })
  }
}

function upsertTranscript(entry) {
  const saved = upsertRecord(state.transcript, entry)
  trimArray(state.transcript, 500)
  broadcast({ type: 'transcript_upsert', entry: saved })
  return saved
}

function upsertTimeline(entry) {
  const saved = upsertRecord(state.timeline, entry)
  trimArray(state.timeline, 500)
  broadcast({ type: 'timeline_upsert', entry: saved })
  return saved
}

function upsertToolCall(entry) {
  const saved = upsertRecord(state.toolCalls, entry)
  state.toolCalls.sort((left, right) => {
    const a = Date.parse(left.startedAt || left.updatedAt || 0)
    const b = Date.parse(right.startedAt || right.updatedAt || 0)
    return b - a
  })
  trimArray(state.toolCalls, 300)
  broadcast({ type: 'tool_upsert', entry: saved })
  return saved
}

async function ensureDirs() {
  await mkdir(dataDir, { recursive: true })
}

async function fileExists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

async function commandExists(command) {
  const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which'
  return await new Promise(resolvePromise => {
    const child = spawn(lookupCommand, [command], {
      stdio: 'ignore',
    })

    child.once('error', () => resolvePromise(false))
    child.once('exit', code => resolvePromise(code === 0))
  })
}

async function pathType(path) {
  try {
    const metadata = await stat(path)
    if (metadata.isDirectory()) {
      return 'directory'
    }
    if (metadata.isFile()) {
      return 'file'
    }
    return 'other'
  } catch {
    return 'missing'
  }
}

async function loadConfig() {
  await ensureDirs()
  if (!(await fileExists(configPath))) {
    return
  }

  try {
    state.config = normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')))
  } catch (error) {
    pushLog(
      'ui',
      `Failed to load config: ${error instanceof Error ? error.message : String(error)}`,
      'warn',
    )
  }
}

function normalizeWorkspaceDir(workspaceDir) {
  return resolve(workspaceDir || state.config.workspaceDir || rootDir)
}

function summarizeAppSession(transcript) {
  const entries = listConversationEntries(transcript)
  const preferred =
    entries.find(entry => entry.role === 'user') ||
    entries.find(entry => entry.role === 'assistant')

  const summary = preferred?.content
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)

  return summary || '新会话'
}

async function readAppSessionsStore() {
  await ensureDirs()
  if (!(await fileExists(appSessionsPath))) {
    return []
  }

  try {
    const payload = JSON.parse(await readFile(appSessionsPath, 'utf8'))
    return Array.isArray(payload) ? payload : []
  } catch (error) {
    pushLog(
      'ui',
      `Failed to load app sessions: ${error instanceof Error ? error.message : String(error)}`,
      'warn',
    )
    return []
  }
}

async function writeAppSessionsStore(records) {
  await ensureDirs()
  await writeFile(appSessionsPath, JSON.stringify(records, null, 2), 'utf8')
}

function persistableRunRequest(request) {
  if (!request) {
    return null
  }

  return {
    id: request.id,
    prompt: request.prompt,
    workspaceDir: request.workspaceDir,
    sessionId: request.sessionId || null,
    createdAt: request.createdAt || safeNow(),
    approval: request.approval || null,
    config: {
      ...request.config,
      upstreamApiKey: '',
    },
  }
}

function hydrateRunRequest(request) {
  if (!request?.prompt || !request?.config) {
    return null
  }

  const config = normalizeConfig({
    ...state.config,
    ...request.config,
    upstreamApiKey: state.config.upstreamApiKey,
  })

  return {
    id: request.id || createId('queued-run'),
    prompt: String(request.prompt || '').trim(),
    workspaceDir: resolve(request.workspaceDir || config.workspaceDir),
    sessionId: request.sessionId || null,
    createdAt: request.createdAt || safeNow(),
    approval: request.approval || null,
    config,
  }
}

async function persistRuntimeQueueState() {
  await ensureDirs()
  await writeFile(
    runtimeStatePath,
    JSON.stringify(
      {
        queue: runQueue.map(persistableRunRequest),
        pendingApproval: persistableRunRequest(pendingApprovalRequest),
      },
      null,
      2,
    ),
    'utf8',
  )
}

function persistRuntimeQueueStateSoon() {
  void persistRuntimeQueueState().catch(error => {
    pushLog(
      'ui',
      `Failed to persist runtime queue state: ${error instanceof Error ? error.message : String(error)}`,
      'warn',
    )
  })
}

async function loadRuntimeQueueState() {
  await ensureDirs()
  if (!(await fileExists(runtimeStatePath))) {
    return
  }

  try {
    const payload = JSON.parse(await readFile(runtimeStatePath, 'utf8'))
    const queue = Array.isArray(payload?.queue)
      ? payload.queue.map(hydrateRunRequest).filter(Boolean)
      : []
    const pendingApproval = hydrateRunRequest(payload?.pendingApproval)

    runQueue.splice(0, runQueue.length, ...queue)
    pendingApprovalRequest = pendingApproval
    syncQueuedState()
  } catch (error) {
    pushLog(
      'ui',
      `Failed to load runtime queue state: ${error instanceof Error ? error.message : String(error)}`,
      'warn',
    )
  }
}

async function repairInterruptedRuns() {
  const records = await readAppSessionsStore()
  let changed = false
  let repairedCount = 0

  const nextRecords = records.map(record => {
    if (record?.runState?.status !== 'running') {
      return record
    }

    changed = true
    repairedCount += 1
    const timestamp = safeNow()
    const nextTimeline = Array.isArray(record.timeline) ? [...record.timeline] : []
    nextTimeline.push({
      id: createId('timeline'),
      kind: 'status',
      status: 'warning',
      title: '上次运行已中断',
      content: '应用或本地主机在任务完成前关闭。你可以重新发起任务，或继续在当前会话中提问。',
      timestamp,
    })
    trimArray(nextTimeline, 300)

    return buildAppSessionRecord({
      sessionId: record.sessionId,
      workspaceDir: record.cwd || state.config.workspaceDir,
      transcript: Array.isArray(record.transcript) ? record.transcript : [],
      toolCalls: Array.isArray(record.toolCalls) ? record.toolCalls : [],
      timeline: nextTimeline,
      lastClawSessionId: record.lastClawSessionId || null,
      runState: {
        ...(record.runState || {}),
        status: 'interrupted',
        endedAt: timestamp,
        message: '上次运行在任务完成前被中断了。',
      },
      lastModified: Date.now(),
    })
  })

  if (!changed) {
    return 0
  }

  await writeAppSessionsStore(nextRecords)
  pushLog('ui', `已恢复 ${repairedCount} 个中断会话。`, 'warn')
  return repairedCount
}

function buildAppSessionRecord({
  sessionId,
  workspaceDir,
  transcript = [],
  toolCalls = [],
  timeline = [],
  lastClawSessionId = null,
  manualSummary = null,
  runState = null,
  lastModified = Date.now(),
}) {
  const nextTranscript = Array.isArray(transcript) ? [...transcript] : []
  const nextToolCalls = Array.isArray(toolCalls) ? [...toolCalls] : []
  const nextTimeline = Array.isArray(timeline) ? [...timeline] : []
  const nextManualSummary =
    typeof manualSummary === 'string' && manualSummary.trim()
      ? manualSummary.trim()
      : null
  trimArray(nextTranscript, 500)
  trimArray(nextToolCalls, 250)
  trimArray(nextTimeline, 300)

  return {
    sessionId,
    summary: nextManualSummary || summarizeAppSession(nextTranscript),
    lastModified,
    cwd: normalizeWorkspaceDir(workspaceDir),
    transcript: nextTranscript,
    toolCalls: nextToolCalls,
    timeline: nextTimeline,
    lastClawSessionId,
    manualSummary: nextManualSummary,
    runState: runState ? { ...runState } : { status: 'idle' },
  }
}

function toAppSessionItem(record) {
  return {
    sessionId: record.sessionId,
    summary: record.summary || '新会话',
    lastModified: record.lastModified || Date.now(),
    cwd: record.cwd || state.config.workspaceDir,
    gitBranch: null,
    runStatus: record.runState?.status || 'idle',
    runMessage: record.runState?.message || null,
  }
}

async function listAppSessions(workspaceDir) {
  const normalizedWorkspace = normalizeWorkspaceDir(workspaceDir)
  const records = await readAppSessionsStore()
  return records
    .filter(record => normalizeWorkspaceDir(record.cwd) === normalizedWorkspace)
    .map(toAppSessionItem)
    .sort((left, right) => right.lastModified - left.lastModified)
}

async function readAppSessionState(sessionId, workspaceDir) {
  const normalizedWorkspace = normalizeWorkspaceDir(workspaceDir)
  const records = await readAppSessionsStore()
  const record =
    records.find(
      candidate =>
        candidate.sessionId === sessionId &&
        normalizeWorkspaceDir(candidate.cwd) === normalizedWorkspace,
    ) || null

  if (!record) {
    return {
      record: null,
      transcript: [],
      toolCalls: [],
      timeline: [],
    }
  }

  return {
    record,
    transcript: Array.isArray(record.transcript) ? record.transcript : [],
    toolCalls: Array.isArray(record.toolCalls) ? record.toolCalls : [],
    timeline: Array.isArray(record.timeline) ? record.timeline : [],
  }
}

async function saveAppSessionState(input) {
  const records = await readAppSessionsStore()
  const existing =
    records.find(record => record.sessionId === input.sessionId) || null
  const nextRecord = buildAppSessionRecord({
    ...input,
    workspaceDir: input.workspaceDir || existing?.cwd || state.config.workspaceDir,
    manualSummary:
      Object.prototype.hasOwnProperty.call(input, 'manualSummary')
        ? input.manualSummary
        : existing?.manualSummary || null,
    runState: input.runState || existing?.runState || null,
  })
  const index = records.findIndex(record => record.sessionId === nextRecord.sessionId)
  if (index >= 0) {
    records[index] = nextRecord
  } else {
    records.push(nextRecord)
  }

  records.sort((left, right) => (right.lastModified || 0) - (left.lastModified || 0))
  await writeAppSessionsStore(records)
  return nextRecord
}

async function createAppSession(workspaceDir = state.config.workspaceDir) {
  return await saveAppSessionState({
    sessionId: createId('session'),
    workspaceDir,
    transcript: [],
    toolCalls: [],
    timeline: [],
    lastClawSessionId: null,
    runState: {
      status: 'idle',
      message: null,
    },
  })
}

async function renameAppSession(sessionId, workspaceDir, summary) {
  const normalizedWorkspace = normalizeWorkspaceDir(workspaceDir)
  const records = await readAppSessionsStore()
  const index = records.findIndex(
    record =>
      record.sessionId === sessionId &&
      normalizeWorkspaceDir(record.cwd) === normalizedWorkspace,
  )

  if (index < 0) {
    throw new Error('没有找到要重命名的会话。')
  }

  const record = records[index]
  records[index] = buildAppSessionRecord({
    sessionId: record.sessionId,
    workspaceDir: record.cwd || workspaceDir,
    transcript: Array.isArray(record.transcript) ? record.transcript : [],
    toolCalls: Array.isArray(record.toolCalls) ? record.toolCalls : [],
    timeline: Array.isArray(record.timeline) ? record.timeline : [],
    lastClawSessionId: record.lastClawSessionId || null,
    manualSummary: summary,
    runState: record.runState || null,
    lastModified: Date.now(),
  })

  records.sort((left, right) => (right.lastModified || 0) - (left.lastModified || 0))
  await writeAppSessionsStore(records)
  return toAppSessionItem(records[index])
}

async function deleteAppSession(sessionId, workspaceDir) {
  const normalizedWorkspace = normalizeWorkspaceDir(workspaceDir)
  const records = await readAppSessionsStore()
  const nextRecords = records.filter(
    record =>
      !(
        record.sessionId === sessionId &&
        normalizeWorkspaceDir(record.cwd) === normalizedWorkspace
      ),
  )

  if (nextRecords.length === records.length) {
    throw new Error('没有找到要删除的会话。')
  }

  await writeAppSessionsStore(nextRecords)
}

function exportedConfig() {
  return {
    ...state.config,
    upstreamApiKey: state.config.upstreamApiKey ? '[REDACTED]' : '',
  }
}

async function buildDiagnosticsExport() {
  const diagnostics = await buildDiagnosticsReport()
  return {
    exportedAt: safeNow(),
    product: 'claw-code',
    diagnostics,
    snapshot: {
      ...snapshotState(),
      config: exportedConfig(),
    },
  }
}

async function saveConfig(config) {
  state.config = normalizeConfig(config)
  for (const item of runQueue) {
    item.config = {
      ...item.config,
      upstreamApiKey: state.config.upstreamApiKey,
    }
  }
  if (pendingApprovalRequest) {
    pendingApprovalRequest.config = {
      ...pendingApprovalRequest.config,
      upstreamApiKey: state.config.upstreamApiKey,
    }
  }
  await ensureDirs()
  const persistableConfig = {
    ...state.config,
    upstreamApiKey: '',
  }
  await writeFile(configPath, JSON.stringify(persistableConfig, null, 2), 'utf8')
  persistRuntimeQueueStateSoon()
  broadcast({ type: 'state', state: snapshotState() })
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function getMimeType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'text/plain; charset=utf-8'
  }
}

function buildClawEnv(config, gatewayUrl) {
  const fallbackHome =
    process.env.HOME ||
    process.env.USERPROFILE ||
    `${process.env.HOMEDRIVE || ''}${process.env.HOMEPATH || ''}` ||
    rootDir

  // Ensure proxy env vars are set for claw.exe (Rust reqwest).
  // Electron desktop apps don't inherit terminal env vars, so also check
  // the Windows system proxy from registry via a cached detection.
  const proxy = detectProxy()

  const env = {
    ...process.env,
    ANTHROPIC_BASE_URL: gatewayUrl,
    ANTHROPIC_API_KEY: config.upstreamApiKey || 'dummy',
    HOME: fallbackHome,
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    ...(proxy ? {
      HTTP_PROXY: proxy, http_proxy: proxy,
      HTTPS_PROXY: proxy, https_proxy: proxy,
    } : {}),
  }

  pushLog('ui', `[DEBUG] ANTHROPIC_BASE_URL=${env.ANTHROPIC_BASE_URL}`)
  pushLog('ui', `[DEBUG] proxy=${proxy || '(none)'}`)
  pushLog('ui', `[DEBUG] NO_PROXY=${env.NO_PROXY}`)
  pushLog('ui', `[DEBUG] HOME=${env.HOME}`)

  return env
}

async function serveStatic(res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const filePath = resolve(publicDir, relativePath)
  try {
    if (!filePath.startsWith(publicDir)) {
      json(res, 403, { error: 'Forbidden' })
      return
    }
    const content = await readFile(filePath)
    res.writeHead(200, { 'content-type': getMimeType(filePath) })
    res.end(content)
  } catch {
    if (!extname(relativePath)) {
      const fallbackPath = resolve(publicDir, 'index.html')
      try {
        const content = await readFile(fallbackPath)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(content)
        return
      } catch {
        // fall through
      }
    }
    json(res, 404, { error: 'Not found' })
  }
}

function spawnLoggedProcess(label, command, args, options) {
  const child = spawn(command, args, options)
  child.stdout?.on('data', chunk => pushLog(label, chunk.toString(), 'info'))
  child.stderr?.on('data', chunk => pushLog(label, chunk.toString(), 'warn'))
  child.on('error', error => {
    pushLog(label, error.stack || error.message, 'error')
  })
  return child
}

async function waitForHealth(url, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${url}/health`)
      if (response.ok) {
        return
      }
    } catch {
      // keep retrying
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000))
  }

  throw new Error(`Gateway did not become healthy at ${url}`)
}

// Bump this when gateway code changes to force restart on next launch
const GATEWAY_CODE_VERSION = 13

function gatewayConfigKey(config) {
  return JSON.stringify({
    _v: GATEWAY_CODE_VERSION,
    upstreamBaseUrl: config.upstreamBaseUrl,
    upstreamApiKey: config.upstreamApiKey,
    upstreamModel: config.upstreamModel,
    gatewayHost: config.gatewayHost,
    gatewayPort: config.gatewayPort,
    textMode: config.textMode || 'openai',
  })
}

async function stopGateway() {
  if (!gatewayChild || gatewayChild.exitCode !== null) {
    return
  }
  pushLog('ui', 'Stopping gateway process...', 'warn')
  gatewayChild.kill('SIGTERM')
  gatewayChild = null
  updateState(draft => {
    draft.gateway.status = 'stopped'
    draft.gateway.url = null
    draft.gateway.configKey = null
    if (draft.run.status !== 'running') {
      draft.status = 'idle'
    }
  })
}

async function ensureGateway(config) {
  const key = gatewayConfigKey(config)
  const gatewayUrl = `http://${config.gatewayHost}:${config.gatewayPort}`
  if (
    gatewayChild &&
    gatewayChild.exitCode === null &&
    state.gateway.configKey === key
  ) {
    return gatewayUrl
  }

  if (gatewayChild && gatewayChild.exitCode === null) {
    await stopGateway()
  }

  updateState(draft => {
    draft.gateway.status = 'starting'
    draft.gateway.url = gatewayUrl
    draft.gateway.configKey = key
    draft.status = 'starting'
  })

  gatewayChild = spawnLoggedProcess('gateway', process.execPath, [gatewayScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      OPENAI_COMPAT_BASE_URL: config.upstreamBaseUrl,
      OPENAI_COMPAT_API_KEY: config.upstreamApiKey || '',
      OPENAI_COMPAT_MODEL: config.upstreamModel,
      GATEWAY_HOST: config.gatewayHost,
      GATEWAY_PORT: String(config.gatewayPort),
      UPSTREAM_TEXT_MODE: config.textMode || 'openai',
      CLAW_WORKSPACE_DIR: config.workspaceDir || '',
      CLAW_ENABLE_SOUL: config.enableSoulInjection ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  gatewayChild.on('exit', code => {
    pushLog(
      'gateway',
      `Gateway exited with code ${String(code)}`,
      code === 0 ? 'info' : 'warn',
    )
    updateState(draft => {
      draft.gateway.status = 'stopped'
      draft.gateway.url = null
      draft.gateway.configKey = null
      if (draft.run.status !== 'running') {
        draft.status = 'idle'
      }
    })
  })

  await waitForHealth(gatewayUrl)

  // Debug: verify gateway is actually reachable
  try {
    const testRes = await fetch(`${gatewayUrl}/v1/models`)
    pushLog('ui', `[DEBUG] Gateway test fetch: ${testRes.status} ${testRes.statusText}`)
  } catch (e) {
    pushLog('ui', `[DEBUG] Gateway test fetch FAILED: ${e.message}`)
  }

  updateState(draft => {
    draft.gateway.status = 'ready'
    draft.gateway.url = gatewayUrl
    draft.status = draft.run.status === 'running' ? 'running' : 'ready'
  })
  pushLog('ui', `Gateway ready at ${gatewayUrl}`)
  return gatewayUrl
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function countPatchLines(hunks) {
  let added = 0
  let removed = 0
  for (const hunk of hunks || []) {
    for (const line of hunk.lines || []) {
      if (typeof line !== 'string') {
        continue
      }
      if (line.startsWith('+')) {
        added += 1
      } else if (line.startsWith('-')) {
        removed += 1
      }
    }
  }
  return { added, removed }
}

function buildSyntheticCreatePatch(content) {
  return [
    {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: String(content).split('\n').length,
      lines: String(content)
        .split('\n')
        .map(line => `+${line}`),
    },
  ]
}

function isFileEditLike(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const record = value
  return (
    typeof record.filePath === 'string' &&
    (Array.isArray(record.structuredPatch) ||
      ((record.type === 'create' || record.type === 'update') &&
        typeof record.content === 'string'))
  )
}

function collectFileEditResults(root) {
  const stack = [root]
  const visited = new Set()
  const results = []

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') {
      continue
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)

    if (isFileEditLike(current)) {
      results.push(current)
      continue
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item)
      }
      continue
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === 'object') {
        stack.push(value)
      }
    }
  }

  return results
}

function buildPatchPreview(hunks, maxLines = 80) {
  const rendered = []
  for (const hunk of hunks || []) {
    rendered.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    )
    for (const line of hunk.lines || []) {
      rendered.push(line)
      if (rendered.length >= maxLines) {
        rendered.push('...')
        return rendered.join('\n')
      }
    }
  }
  return rendered.join('\n')
}

function extractDiffBundle(toolUseResult) {
  const candidates = collectFileEditResults(toolUseResult)
  if (candidates.length === 0) {
    return null
  }

  const files = new Map()
  let totalAdded = 0
  let totalRemoved = 0

  for (const result of candidates) {
    const structuredPatch =
      Array.isArray(result.structuredPatch) && result.structuredPatch.length > 0
        ? result.structuredPatch
        : result.type === 'create' && typeof result.content === 'string'
          ? buildSyntheticCreatePatch(result.content)
          : []

    const counts = countPatchLines(structuredPatch)
    totalAdded += counts.added
    totalRemoved += counts.removed

    files.set(result.filePath, {
      filePath: result.filePath,
      isNewFile: result.type === 'create',
      linesAdded: counts.added,
      linesRemoved: counts.removed,
      patchPreview: buildPatchPreview(structuredPatch),
    })
  }

  return {
    files: [...files.values()],
    stats: {
      filesChanged: files.size,
      linesAdded: totalAdded,
      linesRemoved: totalRemoved,
    },
  }
}

function summarizeDiffBundle(diff) {
  if (!diff) {
    return ''
  }
  return `${diff.stats.filesChanged} files changed | +${diff.stats.linesAdded} / -${diff.stats.linesRemoved}`
}

function summarizeToolResult(toolResult) {
  const rawOutput = typeof toolResult.output === 'string' ? toolResult.output : ''
  const parsedOutput = parseMaybeJson(rawOutput)
  const diff = extractDiffBundle(parsedOutput)
  const preview =
    summarizeDiffBundle(diff) ||
    previewValue(parsedOutput, 700) ||
    'Tool finished without text output.'

  return {
    preview,
    parsedOutput,
    diff,
  }
}

function sessionDir(workspaceDir) {
  return join(workspaceDir, '.claude', 'sessions')
}

async function listSessions(workspaceDir) {
  const directory = sessionDir(workspaceDir)
  if (!(await fileExists(directory))) {
    return []
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const items = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue
    }

    const path = join(directory, entry.name)
    const metadata = await stat(path)
    let summary = 'claw-code 会话'

    try {
      const payload = JSON.parse(await readFile(path, 'utf8'))
      summary = summarizeSession(payload.messages)
    } catch {
      // keep default
    }

    items.push({
      sessionId: entry.name.replace(/\.json$/i, ''),
      summary,
      lastModified: metadata.mtimeMs,
      cwd: workspaceDir,
      gitBranch: null,
      path,
    })
  }

  items.sort((left, right) => right.lastModified - left.lastModified)
  return items
}

function summarizeSession(messages) {
  if (!Array.isArray(messages)) {
    return 'claw-code 会话'
  }

  const candidates = []
  for (const message of messages) {
    if (!Array.isArray(message?.blocks)) {
      continue
    }
    for (const block of message.blocks) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        const normalized = block.text.replace(/\s+/g, ' ').trim()
        if (normalized) {
          candidates.push(normalized)
        }
      }
    }
  }

  return candidates[0]?.slice(0, 90) || 'claw-code 会话'
}

async function readSessionState(sessionId, workspaceDir) {
  const path = join(sessionDir(workspaceDir), `${sessionId}.json`)
  const payload = JSON.parse(await readFile(path, 'utf8'))
  const transcript = []
  const toolCalls = []
  const timeline = []
  const toolMap = new Map()
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const base = Date.now() - messages.length * 5000
  let offset = 0

  const nextTimestamp = () => new Date(base + offset++ * 1000).toISOString()

  for (const message of messages) {
    const role = String(message?.role || 'assistant')
    const blocks = Array.isArray(message?.blocks) ? message.blocks : []
    for (const block of blocks) {
      const timestamp = nextTimestamp()
      if (block?.type === 'text') {
        const content = String(block.text || '').trim()
        if (!content) {
          continue
        }
        transcript.push({
          id: createId('session-text'),
          role: role === 'user' ? 'user' : 'assistant',
          entryType: role === 'user' ? 'user' : 'assistant',
          title: role === 'user' ? 'You' : 'Assistant',
          content,
          timestamp,
          streaming: false,
          isError: false,
        })
        continue
      }

      if (block?.type === 'tool_use') {
        const inputPreview = previewValue(block.input, 500)
        const entry = {
          id: block.id || createId('tool'),
          name: block.name || 'tool',
          title: block.name || 'tool',
          status: 'completed',
          inputPreview,
          resultPreview: '',
          startedAt: timestamp,
          completedAt: timestamp,
          diff: null,
        }
        toolMap.set(entry.id, entry)
        transcript.push({
          id: `tool-use-${entry.id}`,
          role: 'tool',
          entryType: 'tool_use',
          title: entry.title,
          content: inputPreview || 'Tool call',
          timestamp,
          streaming: false,
          isError: false,
          status: 'completed',
          toolUseId: entry.id,
          toolName: entry.name,
        })
        continue
      }

      if (block?.type === 'tool_result') {
        const toolUseId = block.tool_use_id || createId('tool-result')
        const toolName =
          block.tool_name ||
          toolMap.get(toolUseId)?.name ||
          'tool_result'
        const summary = summarizeToolResult({
          tool_use_id: toolUseId,
          tool_name: toolName,
          output:
            typeof block.output === 'string'
              ? block.output
              : flattenBlockText(block.content),
          is_error: Boolean(block.is_error),
        })

        const current = toolMap.get(toolUseId) || {
          id: toolUseId,
          name: toolName,
          title: toolName,
          status: 'completed',
          inputPreview: '',
          resultPreview: '',
          startedAt: timestamp,
          completedAt: timestamp,
          diff: null,
        }

        current.status = block.is_error ? 'error' : 'success'
        current.resultPreview = summary.preview
        current.completedAt = timestamp
        current.diff = summary.diff
        toolMap.set(toolUseId, current)

        transcript.push({
          id: `tool-result-${toolUseId}`,
          role: 'tool',
          entryType: 'tool_result',
          title: `${toolName} result`,
          content: summary.preview,
          timestamp,
          streaming: false,
          isError: Boolean(block.is_error),
          status: current.status,
          toolUseId,
          toolName,
          diff: summary.diff,
          meta: summary.diff ? summarizeDiffBundle(summary.diff) : null,
        })
      }
    }
  }

  for (const call of toolMap.values()) {
    toolCalls.push(call)
  }

  timeline.push({
    id: createId('timeline'),
    kind: 'status',
    status: 'info',
    title: '会话已加载',
    content: `已从 ${sessionId} 恢复 ${messages.length} 条消息`,
    timestamp: safeNow(),
  })

  return {
    transcript,
    toolCalls,
    timeline,
  }
}

async function readSessionSnapshot(sessionId, workspaceDir) {
  const path = join(sessionDir(workspaceDir), `${sessionId}.json`)
  const metadata = await stat(path)
  const restored = await readSessionState(sessionId, workspaceDir)
  return {
    path,
    mtimeMs: metadata.mtimeMs,
    transcript: restored.transcript,
    toolCalls: restored.toolCalls,
    timeline: restored.timeline,
  }
}

async function refreshSessions(workspaceDir = state.config.workspaceDir, { silent = false } = {}) {
  if (!silent) {
    updateState(draft => {
      draft.sessions.status = 'loading'
      draft.sessions.error = null
    })
  }

  try {
    const items = await listAppSessions(workspaceDir)
    const resumableSession =
      items.find(
        item => item.runStatus === 'running',
      ) || null
    let selectedSessionId =
      state.sessions.selectedSessionId ||
      state.run.sessionId ||
      resumableSession?.sessionId ||
      null

    if (selectedSessionId && !items.some(item => item.sessionId === selectedSessionId)) {
      selectedSessionId = items[0]?.sessionId || null
    }

    updateState(draft => {
      draft.sessions.items = items
      draft.sessions.status = 'ready'
      draft.sessions.error = null
      draft.sessions.lastLoadedAt = safeNow()
      draft.sessions.selectedSessionId = selectedSessionId
    })

    if (selectedSessionId && state.run.status !== 'running') {
      const shouldHydrateTranscript = !(
        state.run.transcriptSource === 'live' && state.transcript.length > 0
      )

      if (!shouldHydrateTranscript) {
        return
      }

      const restored = await readAppSessionState(selectedSessionId, workspaceDir)
      const contextMessageCount = countConversationEntries(restored.transcript)
      updateState(draft => {
        draft.transcript = restored.transcript
        draft.toolCalls = restored.toolCalls
        draft.timeline = restored.timeline
        draft.run.sessionId = selectedSessionId
        draft.run.resumeSessionId = restored.record?.lastClawSessionId || null
        draft.run.cwd = workspaceDir
        draft.run.contextMode = contextMessageCount > 1 ? 'carry-over' : 'fresh'
        draft.run.contextMessageCount = contextMessageCount
        draft.run.carriedMessageCount = 0
        draft.run.transcriptSource = 'session'
      })
    } else if (!selectedSessionId && state.run.status !== 'running') {
      updateState(draft => {
        draft.transcript = []
        draft.toolCalls = []
        draft.timeline = []
        draft.run.sessionId = null
        draft.run.resumeSessionId = null
        draft.run.contextMode = 'fresh'
        draft.run.contextMessageCount = 0
        draft.run.carriedMessageCount = 0
        draft.run.transcriptSource = 'live'
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushLog('sessions', message, 'warn')
    updateState(draft => {
      draft.sessions.status = 'error'
      draft.sessions.error = message
    })
  }
}

async function selectSession(sessionId) {
  if (
    (state.run.status === 'running' || pendingApprovalRequest || runQueue.length > 0) &&
    sessionId &&
    sessionId !== state.run.sessionId
  ) {
    throw new Error('当前任务仍在运行，请先等待完成或手动停止，然后再切换会话。')
  }

  updateState(draft => {
    draft.sessions.selectedSessionId = sessionId || null
  })

  if (!sessionId || state.run.status === 'running' || pendingApprovalRequest || runQueue.length > 0) {
    return
  }

  if (persistentHost && persistentHost.appSessionId !== sessionId) {
    await disposePersistentHost('切换到其他会话')
  }

  const restored = await readAppSessionState(sessionId, state.config.workspaceDir)
  const contextMessageCount = countConversationEntries(restored.transcript)
  updateState(draft => {
    draft.transcript = restored.transcript
    draft.toolCalls = restored.toolCalls
    draft.timeline = restored.timeline
    draft.run.sessionId = sessionId
    draft.run.resumeSessionId = restored.record?.lastClawSessionId || null
    draft.run.cwd = draft.config.workspaceDir
    draft.run.contextMode = contextMessageCount > 1 ? 'carry-over' : 'fresh'
    draft.run.contextMessageCount = contextMessageCount
    draft.run.carriedMessageCount = 0
    draft.run.transcriptSource = 'session'
  })
}

function resolvePreferredBinaryPath(config) {
  if (process.env.CLAW_BINARY_PATH) {
    return resolve(process.env.CLAW_BINARY_PATH)
  }
  const clawProjectDir = resolve(config.clawProjectDir)
  return config.clawBinaryPath
    ? resolve(config.clawBinaryPath)
    : join(
        clawProjectDir,
        'rust',
        'target',
        'release',
        process.platform === 'win32' ? 'claw.exe' : 'claw',
      )
}

async function resolveRunner(config) {
  const clawProjectDir = resolve(config.clawProjectDir)
  const preferredBinary = resolvePreferredBinaryPath(config)
  const manifestPath = join(clawProjectDir, 'rust', 'Cargo.toml')

  if (
    (config.runner === 'binary' || config.runner === 'auto') &&
    (await fileExists(preferredBinary))
  ) {
    return {
      label: 'binary',
      command: preferredBinary,
      args: [],
    }
  }

  if (config.runner === 'binary') {
    throw new Error(
      `在 ${preferredBinary} 没有找到 Claw 二进制。请先编译 Rust CLI，或把运行方式切换为 Cargo。`,
    )
  }

  if (!(await fileExists(manifestPath))) {
    throw new Error(`没有在 ${manifestPath} 找到 Rust manifest 文件。`)
  }

  if (!(await commandExists('cargo'))) {
    throw new Error(
      '系统 PATH 中没有找到 Cargo。请先安装 Rust / Cargo，或者编译 claw.exe 后切换到二进制运行方式。',
    )
  }

  return {
    label: 'cargo',
    command: 'cargo',
    args: ['run', '--quiet', '--manifest-path', manifestPath, '--'],
  }
}

async function runConnectionDiagnostics(rawConfig) {
  const config = normalizeConfig(rawConfig)
  const checks = []

  const addCheck = (id, title, status, detail) => {
    checks.push({ id, title, status, detail })
  }

  addCheck(
    'upstream-config',
    '上游接口',
    config.upstreamBaseUrl && config.upstreamModel
      ? config.upstreamApiKey
        ? 'pass'
        : 'warn'
      : 'fail',
    config.upstreamBaseUrl && config.upstreamModel
      ? config.upstreamApiKey
        ? `${config.upstreamBaseUrl} | ${config.upstreamModel}`
        : `${config.upstreamBaseUrl} | ${config.upstreamModel} | 当前未保存 API Key；如果你使用的是本地 provider，这通常是没问题的。`
      : '必须填写上游接口地址和上游模型。',
  )

  const workspaceType = await pathType(resolve(config.workspaceDir))
  addCheck(
    'workspace',
    '工作区目录',
    workspaceType === 'directory' ? 'pass' : 'fail',
    workspaceType === 'directory'
      ? resolve(config.workspaceDir)
      : `工作区目录不存在：${resolve(config.workspaceDir)}`,
  )

  const clawProjectType = await pathType(resolve(config.clawProjectDir))
  addCheck(
    'claw-project',
    'Claw 项目目录',
    clawProjectType === 'directory' ? 'pass' : 'fail',
    clawProjectType === 'directory'
      ? resolve(config.clawProjectDir)
      : `Claw 项目目录不存在：${resolve(config.clawProjectDir)}`,
  )

  const preferredBinary = resolvePreferredBinaryPath(config)
  const manifestPath = join(resolve(config.clawProjectDir), 'rust', 'Cargo.toml')
  const binaryType = await pathType(preferredBinary)
  const manifestType = await pathType(manifestPath)
  const cargoInstalled = await commandExists('cargo')

  if (config.runner === 'binary') {
    addCheck(
      'runner',
      '运行方式',
      binaryType === 'file' ? 'pass' : 'fail',
      binaryType === 'file'
        ? `二进制已就绪：${preferredBinary}`
        : `当前选择的是二进制运行方式，但在 ${preferredBinary} 没有找到 claw 可执行文件。`,
    )
  } else if (config.runner === 'cargo') {
    addCheck(
      'runner',
      '运行方式',
      manifestType === 'file' && cargoInstalled ? 'pass' : 'fail',
      manifestType !== 'file'
        ? `当前选择的是 Cargo 运行方式，但没有找到 ${manifestPath}。`
        : cargoInstalled
          ? `Cargo 可用，并且 ${manifestPath} 存在。`
          : '当前选择的是 Cargo 运行方式，但系统 PATH 中没有找到 Cargo。',
    )
  } else {
    addCheck(
      'runner',
      '运行方式',
      binaryType === 'file' || (manifestType === 'file' && cargoInstalled) ? 'pass' : 'fail',
      binaryType === 'file'
        ? `自动模式会使用这个二进制：${preferredBinary}`
        : manifestType === 'file' && cargoInstalled
          ? `自动模式会回退到 Cargo，并使用 ${manifestPath}`
          : '自动模式既没有可用的二进制，也没有可用的 Cargo 回退链路。',
    )
  }

  const hasBlockingFailure = checks.some(check => check.status === 'fail')
  if (hasBlockingFailure) {
    return {
      ok: false,
      checks,
      gatewayUrl: state.gateway.url,
      sampleText: null,
      testedAt: safeNow(),
    }
  }

  try {
    const gatewayUrl = await ensureGateway(config)
    addCheck('gateway', '网关', 'pass', `网关已就绪：${gatewayUrl}`)

    const upstreamResponse = await fetch(`${gatewayUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.upstreamApiKey || 'dummy',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.clawModel || config.upstreamModel,
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: 'Reply with OK only.',
          },
        ],
      }),
    })

    if (!upstreamResponse.ok) {
      const errorText = stripAnsi(await upstreamResponse.text())
      addCheck(
        'upstream-response',
        '模型响应',
        'fail',
        formatUserFacingError(errorText || `Gateway returned ${upstreamResponse.status}`),
      )
      return {
        ok: false,
        checks,
        gatewayUrl,
        sampleText: null,
        testedAt: safeNow(),
      }
    }

    const payload = await upstreamResponse.json().catch(() => ({}))
    const sampleText = flattenBlockText(payload?.content).trim() || 'Connection test succeeded.'
    addCheck('upstream-response', '模型响应', 'pass', sampleText)

    return {
      ok: true,
      checks,
      gatewayUrl,
      sampleText,
      testedAt: safeNow(),
    }
  } catch (error) {
    addCheck(
      'gateway',
      '网关',
      'fail',
      formatUserFacingError(error instanceof Error ? error.message : String(error)),
    )

    return {
      ok: false,
      checks,
      gatewayUrl: state.gateway.url,
      sampleText: null,
      testedAt: safeNow(),
    }
  }
}

function parseLastJsonLine(text) {
  const lines = stripAnsi(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // keep scanning
    }
  }

  return null
}

function buildToolArtifacts(payload) {
  const uses = Array.isArray(payload?.tool_uses) ? payload.tool_uses : []
  const results = Array.isArray(payload?.tool_results) ? payload.tool_results : []
  const resultMap = new Map(results.map(result => [result.tool_use_id, result]))
  const toolCalls = []
  const transcript = []
  const timeline = []

  for (const toolUse of uses) {
    const toolResult = resultMap.get(toolUse.id)
    const summary = toolResult ? summarizeToolResult(toolResult) : null
    const status = toolResult
      ? toolResult.is_error
        ? 'error'
        : 'success'
      : 'completed'
    const timestamp = safeNow()

    toolCalls.push({
      id: toolUse.id,
      name: toolUse.name,
      title: toolUse.name,
      status,
      inputPreview: previewValue(parseMaybeJson(toolUse.input), 500),
      resultPreview: summary?.preview || '',
      startedAt: timestamp,
      completedAt: timestamp,
      diff: summary?.diff || null,
    })

    transcript.push({
      id: `tool-use-${toolUse.id}`,
      role: 'tool',
      entryType: 'tool_use',
      title: toolUse.name,
      content: previewValue(parseMaybeJson(toolUse.input), 500),
      timestamp,
      streaming: false,
      isError: false,
      status,
      toolUseId: toolUse.id,
      toolName: toolUse.name,
    })

    if (toolResult) {
      transcript.push({
        id: `tool-result-${toolUse.id}`,
        role: 'tool',
        entryType: 'tool_result',
        title: `${toolUse.name} result`,
        content: summary.preview,
        timestamp,
        streaming: false,
        isError: Boolean(toolResult.is_error),
        status,
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        diff: summary.diff,
        meta: summary.diff ? summarizeDiffBundle(summary.diff) : null,
      })
    }
  }

  if (toolCalls.length > 0) {
    timeline.push({
      id: createId('tool-summary'),
      kind: 'tool_summary',
      status: 'info',
      title: '工具摘要',
      content: `本轮共完成 ${toolCalls.length} 次工具调用。`,
      timestamp: safeNow(),
    })
  }

  return { toolCalls, transcript, timeline }
}

function queueRunRequest(request) {
  runQueue.push(request)
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  updateState(draft => {
    draft.run.queue = state.run.queue
    draft.run.pendingApproval = state.run.pendingApproval
  })
  pushLog('ui', `已将任务加入等待队列：${previewPrompt(request.prompt, 60)}`, 'info')
  return summarizeQueuedRun(request)
}

async function markPendingApproval(request) {
  pendingApprovalRequest = request
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  updateState(draft => {
    draft.run.pendingApproval = state.run.pendingApproval
    draft.run.queue = state.run.queue
  })
  pushLog('ui', `高风险运行待确认：${previewPrompt(request.prompt, 60)}`, 'warn')
}

function persistentHostKey({ config, runner, workspaceDir, model, appSessionId }) {
  return JSON.stringify({
    runner: runner.label,
    command: runner.command,
    workspaceDir: normalizeWorkspaceDir(workspaceDir),
    model,
    permissionMode: config.permissionMode,
    appSessionId,
    gatewayKey: gatewayConfigKey(config),
  })
}

async function disposePersistentHost(reason = '') {
  const host = persistentHost
  if (!host) {
    return
  }

  if (persistentHost === host) {
    persistentHost = null
  }

  host.shuttingDown = true
  if (reason) {
    pushLog('ui', `已释放长驻 REPL：${reason}`, 'info')
  }

  if (host.child && host.child.exitCode === null) {
    try {
      host.child.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
}

async function syncPersistentHostBaseline(host) {
  if (!host?.clawSessionId) {
    return
  }

  const snapshot = await readSessionSnapshot(host.clawSessionId, host.workspaceDir)
  host.syncedSessionMtime = snapshot.mtimeMs
  host.syncedTranscriptCount = snapshot.transcript.length
  host.syncedToolIds = new Set(snapshot.toolCalls.map(call => call.id))
}

async function ensurePersistentHost({ runner, config, gatewayUrl, workspaceDir, model, appSessionId }) {
  const key = persistentHostKey({ config, runner, workspaceDir, model, appSessionId })

  if (
    persistentHost &&
    persistentHost.key === key &&
    persistentHost.child &&
    persistentHost.child.exitCode === null &&
    persistentHost.ready
  ) {
    return persistentHost
  }

  if (persistentHost) {
    await disposePersistentHost('切换到新的工作会话')
  }

  const beforeSessions = await listSessions(workspaceDir)
  const beforeSessionIds = new Set(beforeSessions.map(item => item.sessionId))
  const args = [...runner.args, '--model', model, '--permission-mode', config.permissionMode]

  const child = spawn(runner.command, args, {
    cwd: workspaceDir,
    env: buildClawEnv(config, gatewayUrl),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const host = {
    key,
    child,
    runnerLabel: runner.label,
    workspaceDir,
    model,
    permissionMode: config.permissionMode,
    appSessionId,
    ready: false,
    shuttingDown: false,
    exited: false,
    stdout: '',
    stderr: '',
    promptCount: 0,
    clawSessionId: null,
    clawSessionPath: null,
    syncedSessionMtime: 0,
    syncedTranscriptCount: 0,
    syncedToolIds: new Set(),
    activeTurn: null,
  }

  persistentHost = host
  pushLog('ui', `正在启动原生长驻 REPL：${runner.label}`, 'info')

  child.stdout?.on('data', chunk => {
    const text = chunk.toString()
    host.stdout += text
    host.promptCount = countReplPrompts(host.stdout)
    pushLog('claw', text, 'info')

    if (host.activeTurn) {
      host.activeTurn.stdout += text
    }
  })

  child.stderr?.on('data', chunk => {
    const text = chunk.toString()
    host.stderr += text
    pushLog('claw', text, 'warn')

    if (host.activeTurn) {
      host.activeTurn.stderr += text
    }
  })

  child.on('error', error => {
    host.exited = true
    pushLog('claw', error.stack || error.message, 'error')
    if (host.activeTurn) {
      void finalizePersistentHostTurn(host, {
        exitCode: -1,
        didFail: true,
        rawMessage: `长驻 REPL 启动失败：${error.message}`,
      })
    } else if (persistentHost === host) {
      persistentHost = null
    }
  })

  child.once('exit', code => {
    host.exited = true
    pushLog(
      'claw',
      `长驻 REPL 已退出，退出码：${String(code)}`,
      code === 0 ? 'info' : 'warn',
    )

    if (host.activeTurn) {
      void finalizePersistentHostTurn(host, {
        exitCode: code ?? -1,
        didFail: !pendingStop,
        rawMessage: pendingStop ? '运行已停止。' : `长驻 REPL 已退出，退出码：${String(code)}`,
      })
      return
    }

    if (persistentHost === host) {
      persistentHost = null
    }
  })

  try {
    await waitForCondition(
      async () => {
        if (host.exited) {
          throw new Error('长驻 REPL 在启动时提前退出。')
        }
        const sessions = await listSessions(workspaceDir)
        const created =
          sessions.find(item => !beforeSessionIds.has(item.sessionId)) || null
        if (!created) {
          return false
        }
        host.clawSessionId = created.sessionId
        host.clawSessionPath = created.path
        return true
      },
      {
        timeoutMs: 12000,
        errorMessage: '长驻 REPL 会话初始化超时。',
      },
    )

    await waitForCondition(
      () => {
        if (host.exited) {
          throw new Error('长驻 REPL 在等待输入阶段退出。')
        }
        return host.promptCount > 0
      },
      {
        timeoutMs: 12000,
        errorMessage: '长驻 REPL 没有进入可输入状态。',
      },
    )

    await syncPersistentHostBaseline(host)
    host.ready = true
    pushLog('ui', `原生长驻 REPL 已就绪：${host.clawSessionId}`, 'info')
    return host
  } catch (error) {
    await disposePersistentHost('初始化失败')
    const nextError = error instanceof Error ? error : new Error(String(error))
    nextError.fallbackAllowed = true
    throw nextError
  }
}

async function finalizePersistentHostTurn(
  host,
  { exitCode = 0, didFail = false, rawMessage = null } = {},
) {
  const context = host?.activeTurn
  if (!context || context.finalized) {
    return
  }
  context.finalized = true

  let nextTranscript = [...state.transcript]
  let nextToolCalls = [...state.toolCalls]
  let numTurns = 1
  let failed = didFail
  let resultMessage = ''

  if (!failed && host.clawSessionId) {
    try {
      const snapshot = await readSessionSnapshot(host.clawSessionId, context.workspaceDir)
      const rawDeltaTranscript = snapshot.transcript
        .slice(context.baseTranscriptCount)
        .filter(entry => entry.role !== 'user')
      const deltaTranscript = restampTranscriptEntries(
        rawDeltaTranscript,
        latestTranscriptTimestamp(state.transcript, Date.parse(context.startedAt || safeNow())),
      )
      const deltaToolCalls = snapshot.toolCalls.filter(
        call => !context.baseToolIds.has(call.id),
      )
      const assistantEntries = deltaTranscript.filter(
        entry =>
          entry.role === 'assistant' &&
          entry.entryType === 'assistant' &&
          !entry.isError,
      )

      nextTranscript = [...state.transcript, ...deltaTranscript]
      trimArray(nextTranscript, 500)

      nextToolCalls = [...state.toolCalls, ...deltaToolCalls]
      trimArray(nextToolCalls, 250)

      host.syncedSessionMtime = snapshot.mtimeMs
      host.syncedTranscriptCount = snapshot.transcript.length
      host.syncedToolIds = new Set(snapshot.toolCalls.map(call => call.id))

      resultMessage =
        assistantEntries.at(-1)?.content?.trim() ||
        trimReplOutput(context.stdout) ||
        '运行完成。'
    } catch (error) {
      failed = true
      rawMessage = `同步长驻会话失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  if (failed) {
    resultMessage = pendingStop
      ? '运行已停止。'
      : formatUserFacingError(
          rawMessage ||
            trimReplOutput(`${context.stderr}\n${context.stdout}`) ||
            '没有捕获到有效回复。',
        )

    nextTranscript = [
      ...state.transcript,
      {
        id: createId('assistant-final'),
        role: 'assistant',
        entryType: 'assistant',
        title: 'Assistant',
        content: resultMessage,
        timestamp: safeNow(),
        streaming: false,
        isError: true,
      },
    ]
    trimArray(nextTranscript, 500)
  }

  const nextTimeline = [
    ...state.timeline,
    {
      id: createId('result'),
      kind: 'result',
      status: pendingStop ? 'warning' : failed ? 'error' : 'success',
      title: pendingStop ? '运行已停止' : failed ? '运行失败' : '运行完成',
      content: resultMessage,
      timestamp: safeNow(),
    },
  ]
  trimArray(nextTimeline, 300)

  await saveAppSessionState({
    sessionId: context.appSessionId,
    workspaceDir: context.workspaceDir,
    transcript: nextTranscript,
    toolCalls: nextToolCalls,
    timeline: nextTimeline,
    lastClawSessionId: host.clawSessionId || null,
    runState: {
      status: pendingStop ? 'stopped' : failed ? 'failed' : 'completed',
      startedAt: context.startedAt || state.run.startedAt || null,
      endedAt: safeNow(),
      exitCode,
      prompt: context.prompt || null,
      model: context.model || null,
      permissionMode: context.permissionMode || null,
      message: resultMessage,
    },
  })

  const latestAppSessions = await listAppSessions(context.workspaceDir)
  const contextMessageCount = countConversationEntries(nextTranscript)

  updateState(draft => {
    draft.run.status = 'idle'
    draft.run.exitCode = exitCode
    draft.run.endedAt = safeNow()
    draft.run.sessionId = context.appSessionId
    draft.run.resumeSessionId = host.clawSessionId || null
    draft.run.cwd = context.workspaceDir
    draft.run.lastResult = {
      totalCostUsd: null,
      numTurns,
    }
    draft.sessions.items = latestAppSessions
    draft.sessions.selectedSessionId = context.appSessionId
    draft.sessions.status = 'ready'
    draft.sessions.error = null
    draft.status = draft.gateway.status === 'ready' ? 'ready' : 'idle'
    draft.transcript = nextTranscript
    draft.toolCalls = nextToolCalls
    draft.timeline = nextTimeline
    draft.run.contextMode = contextMessageCount > 1 ? 'carry-over' : 'fresh'
    draft.run.contextMessageCount = contextMessageCount
    draft.run.carriedMessageCount = 0
    draft.run.transcriptSource = 'live'
  })

  pushLog(
    'ui',
    pendingStop
      ? '长驻 REPL 运行已停止。'
      : failed
        ? `长驻 REPL 运行失败：${resultMessage}`
        : `长驻 REPL 已完成：${previewPrompt(context.prompt, 60)}`,
    pendingStop || failed ? 'warn' : 'info',
  )

  host.activeTurn = null
  if ((host.child && host.child.exitCode !== null) || host.shuttingDown) {
    if (persistentHost === host) {
      persistentHost = null
    }
  }
  pendingStop = false
  persistRuntimeQueueStateSoon()
  await pumpRunQueue()

  if (!failed) {
    runMagicDocsHook().catch(() => {})
    checkAndRunDream().catch(() => {})
    // Append to daily memory log
    const logSummary = state.transcript.slice(-4)
      .filter(e => e.role === 'user' || e.role === 'assistant')
      .map(e => `- ${e.role === 'user' ? '用户' : 'AI'}：${(e.content || '').slice(0, 100)}`)
      .join('\n')
    if (logSummary && state.config.workspaceDir) {
      appendDailyLog(state.config.workspaceDir, state.run.sessionId || 'unknown', logSummary).catch(() => {})
    }
  }
}

async function executePersistentHostTurn(host, context) {
  if (!host?.child || host.child.exitCode !== null || !host.child.stdin) {
    const error = new Error('长驻 REPL 当前不可写入。')
    error.fallbackAllowed = true
    throw error
  }

  host.activeTurn = {
    ...context,
    basePromptCount: host.promptCount,
    baseTranscriptCount: host.syncedTranscriptCount,
    baseToolIds: new Set(host.syncedToolIds),
    stdout: '',
    stderr: '',
    finalized: false,
  }

  host.child.stdin.write(`${context.runnerPrompt}\n`, 'utf8')

  try {
    await waitForCondition(
      () => {
        if (host.activeTurn?.finalized) {
          return true
        }
        if (host.exited) {
          return true
        }
        return host.promptCount > host.activeTurn.basePromptCount
      },
      {
        timeoutMs: 15 * 60 * 1000,
        errorMessage: '长驻 REPL 响应超时。',
      },
    )

    if (!host.activeTurn?.finalized) {
      await finalizePersistentHostTurn(host, { exitCode: 0 })
    }
  } catch (error) {
    if (host.activeTurn?.finalized) {
      return
    }

    host.shuttingDown = true
    try {
      host.child.kill('SIGTERM')
    } catch {
      // ignore
    }

    await finalizePersistentHostTurn(host, {
      exitCode: -1,
      didFail: true,
      rawMessage: error instanceof Error ? error.message : String(error),
    })
  }
}

async function clearQueuedRuns() {
  runQueue.splice(0, runQueue.length)
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  updateState(draft => {
    draft.run.queue = state.run.queue
    draft.run.pendingApproval = state.run.pendingApproval
  })
  pushLog('ui', '等待队列已清空。', 'info')
}

async function stopClawRun() {
  if (persistentHost?.activeTurn && persistentHost.child?.exitCode === null) {
    pendingStop = true
    pushLog('ui', '正在停止长驻 REPL 当前任务……', 'warn')
    persistentHost.shuttingDown = true
    persistentHost.child.kill('SIGTERM')
    return
  }

  if (!clawChild || clawChild.exitCode !== null) {
    return
  }
  pendingStop = true
  pushLog('ui', '正在停止 Claw 进程……', 'warn')
  clawChild.kill('SIGTERM')
}

async function finalizeClawRun(exitCode, context, spawnError = null) {
  if (context.finalized) {
    return
  }
  context.finalized = true

  const payload = parseLastJsonLine(context.stdout)
  const latestClawSessions = await listSessions(context.workspaceDir)
  const newClawSession =
    latestClawSessions.find(item => !context.beforeSessionIds.has(item.sessionId)) ||
    latestClawSessions[0] ||
    null
  const clawSessionId = newClawSession?.sessionId || null

  const artifacts = buildToolArtifacts(payload)
  const rawResultMessage =
    spawnError ||
    payload?.message ||
    (pendingStop
      ? '运行已停止。'
      : stripAnsi(context.stdout).trim() || '没有捕获到有效回复。')
  const didFail = Boolean(spawnError) || (exitCode !== 0 && !pendingStop)
  const resultMessage = didFail
    ? formatUserFacingError(rawResultMessage)
    : rawResultMessage

  const nextTranscript = [...state.transcript]
  nextTranscript.push({
    id: createId('assistant-final'),
    role: 'assistant',
    entryType: 'assistant',
    title: 'Assistant',
    content: resultMessage,
    timestamp: safeNow(),
    streaming: false,
    isError: didFail,
  })
  nextTranscript.push(...artifacts.transcript)
  trimArray(nextTranscript, 500)

  const nextToolCalls = [...state.toolCalls, ...artifacts.toolCalls]
  trimArray(nextToolCalls, 250)

  const nextTimeline = [
    ...state.timeline,
    ...artifacts.timeline,
    {
      id: createId('result'),
      kind: 'result',
      status: pendingStop ? 'warning' : didFail ? 'error' : 'success',
        title: pendingStop ? '运行已停止' : didFail ? '运行失败' : '运行完成',
      content: resultMessage,
      timestamp: safeNow(),
    },
  ]
  trimArray(nextTimeline, 300)

  await saveAppSessionState({
    sessionId: context.appSessionId,
    workspaceDir: context.workspaceDir,
    transcript: nextTranscript,
    toolCalls: nextToolCalls,
    timeline: nextTimeline,
    lastClawSessionId: clawSessionId,
    runState: {
      status: pendingStop ? 'stopped' : didFail ? 'failed' : 'completed',
      startedAt: context.startedAt || state.run.startedAt || null,
      endedAt: safeNow(),
      exitCode,
      prompt: context.prompt || null,
      model: context.model || null,
      permissionMode: context.permissionMode || null,
      message: resultMessage,
    },
  })
  const latestAppSessions = await listAppSessions(context.workspaceDir)
  const contextMessageCount = countConversationEntries(nextTranscript)

  updateState(draft => {
    draft.run.status = 'idle'
    draft.run.exitCode = exitCode
    draft.run.endedAt = safeNow()
    draft.run.sessionId = context.appSessionId
    draft.run.resumeSessionId = clawSessionId
    draft.run.cwd = context.workspaceDir
    draft.run.lastResult = {
      totalCostUsd: null,
      numTurns: payload?.iterations || 1,
      usage: payload?.usage || null,
    }
    draft.sessions.items = latestAppSessions
    draft.sessions.selectedSessionId = context.appSessionId
    draft.sessions.status = 'ready'
    draft.sessions.error = null
    draft.status = draft.gateway.status === 'ready' ? 'ready' : 'idle'
    draft.transcript = nextTranscript
    draft.toolCalls = nextToolCalls
    draft.timeline = nextTimeline
    draft.run.contextMode = contextMessageCount > 1 ? 'carry-over' : 'fresh'
    draft.run.contextMessageCount = contextMessageCount
    draft.run.carriedMessageCount = 0
    draft.run.transcriptSource = 'live'
  })

  pushLog(
    'ui',
    pendingStop
      ? 'Claw 运行已停止。'
      : `claw-code 已结束，退出码：${String(exitCode)}`,
    pendingStop ? 'warn' : 'info',
  )

  clawChild = null
  pendingStop = false
  persistRuntimeQueueStateSoon()
  await pumpRunQueue()

  if (!spawnError && exitCode === 0) {
    runMagicDocsHook().catch(() => {})
    checkAndRunDream().catch(() => {})
    // Append to daily memory log
    const logSummary = state.transcript.slice(-4)
      .filter(e => e.role === 'user' || e.role === 'assistant')
      .map(e => `- ${e.role === 'user' ? '用户' : 'AI'}：${(e.content || '').slice(0, 100)}`)
      .join('\n')
    if (logSummary && context.workspaceDir) {
      appendDailyLog(context.workspaceDir, context.appSessionId || 'unknown', logSummary).catch(() => {})
    }
  }
}

async function executeRunRequest(request) {
  if (
    state.run.status === 'running' ||
    persistentHost?.activeTurn ||
    (clawChild && clawChild.exitCode === null)
  ) {
    throw new Error('当前已经有一个运行中的任务。')
  }

  const { config, prompt } = request
  await saveConfig(config)
  const gatewayUrl = await ensureGateway(config)
  const workspaceDir = request.workspaceDir
  const runner = await resolveRunner(config)
  const model = config.clawModel || 'sonnet'
  const beforeClawSessions = await listSessions(workspaceDir)
  const beforeSessionIds = new Set(beforeClawSessions.map(item => item.sessionId))
  const fallbackPromptContext = await buildPromptWithCarryOver(state.transcript, prompt)
  const appSessionId =
    request.sessionId || state.sessions.selectedSessionId || state.run.sessionId || createId('session')
  const nextUserEntry = {
    id: createId('user'),
    role: 'user',
    entryType: 'user',
    title: 'You',
    content: prompt,
    timestamp: safeNow(),
    streaming: false,
    isError: false,
  }
  const nextTranscript = [...state.transcript, nextUserEntry]
  trimArray(nextTranscript, 500)
  const startedAt = safeNow()
  const nextTimeline = [
    ...state.timeline,
    {
      id: createId('start'),
      kind: 'status',
      status: 'running',
      title: 'claw-code 已启动',
      content: [
        `运行方式：${runner.label}`,
        `工作区：${workspaceDir}`,
        countConversationEntries(state.transcript) > 0
          ? '上下文延续：将优先沿用当前会话的历史上下文。'
          : '上下文延续：当前从新一轮开始。',
      ].join('\n'),
      timestamp: startedAt,
    },
  ]
  trimArray(nextTimeline, 300)
  const contextMessageCount = countConversationEntries(nextTranscript)

  const args = [
    ...runner.args,
    '--model',
    model,
    '--permission-mode',
    config.permissionMode,
    '--output-format',
    'json',
    'prompt',
    fallbackPromptContext.runnerPrompt,
  ]

  updateState(draft => {
    draft.status = 'running'
    draft.run.status = 'running'
    draft.run.currentPrompt = prompt
    draft.run.startedAt = startedAt
    draft.run.endedAt = null
    draft.run.exitCode = null
    draft.run.outputFormat = 'json'
    draft.run.model = model
    draft.run.cwd = workspaceDir
    draft.run.permissionMode = config.permissionMode
    draft.run.lastResult = null
    draft.run.sessionId = appSessionId
    draft.run.contextMode = contextMessageCount > 1 ? 'carry-over' : 'fresh'
    draft.run.contextMessageCount = contextMessageCount
    draft.run.carriedMessageCount = 0
    draft.run.transcriptSource = 'live'
    draft.run.queue = state.run.queue
    draft.run.pendingApproval = state.run.pendingApproval
    draft.sessions.selectedSessionId = appSessionId
    draft.transcript = nextTranscript
    draft.timeline = nextTimeline
  })

  await saveAppSessionState({
    sessionId: appSessionId,
    workspaceDir,
    transcript: nextTranscript,
    toolCalls: state.toolCalls,
    timeline: nextTimeline,
    lastClawSessionId: state.run.resumeSessionId || null,
    runState: {
      status: 'running',
      startedAt,
      message: '任务正在运行中。',
      prompt,
      model,
      permissionMode: config.permissionMode,
    },
  })
  const latestAppSessions = await listAppSessions(workspaceDir)
  updateState(draft => {
    draft.sessions.items = latestAppSessions
    draft.sessions.selectedSessionId = appSessionId
  })

  pushLog(
    'ui',
    `正在用 ${runner.label} 运行方式在 ${workspaceDir} 启动 Claw`,
  )

  pendingStop = false
  pendingApprovalRequest = null
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  try {
    const host = await ensurePersistentHost({
      runner,
      config,
      gatewayUrl,
      workspaceDir,
      model,
      appSessionId,
    })

    await executePersistentHostTurn(host, {
      appSessionId,
      workspaceDir,
      prompt,
      model,
      permissionMode: config.permissionMode,
      startedAt,
      runnerPrompt: prompt,
    })
    return
  } catch (error) {
    pushLog(
      'ui',
      `原生长驻 REPL 未能接管，本轮回退到单次 prompt：${
        error instanceof Error ? error.message : String(error)
      }`,
      'warn',
    )
  }

  const context = {
    stdout: '',
    workspaceDir,
    beforeSessionIds,
    appSessionId,
    prompt,
    model,
    permissionMode: config.permissionMode,
    startedAt,
    finalized: false,
  }

  clawChild = spawn(runner.command, args, {
    cwd: workspaceDir,
    env: buildClawEnv(config, gatewayUrl),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  clawChild.stdout?.on('data', chunk => {
    const text = chunk.toString()
    context.stdout += text
    pushLog('claw', text, 'info')
  })
  clawChild.stderr?.on('data', chunk => {
    pushLog('claw', chunk.toString(), 'warn')
  })
  clawChild.on('error', error => {
    const message = error.stack || error.message
    pushLog('claw', message, 'error')
    void finalizeClawRun(-1, context, `Claw 启动失败：${error.message}`)
  })
  clawChild.once('exit', exitCode => {
    void finalizeClawRun(exitCode, context)
  })
}

async function pumpRunQueue() {
  if (
    state.run.status === 'running' ||
    persistentHost?.activeTurn ||
    (clawChild && clawChild.exitCode === null) ||
    pendingApprovalRequest
  ) {
    syncQueuedState()
    updateState(draft => {
      draft.run.queue = state.run.queue
      draft.run.pendingApproval = state.run.pendingApproval
    })
    return
  }

  const next = runQueue.shift()
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  updateState(draft => {
    draft.run.queue = state.run.queue
    draft.run.pendingApproval = state.run.pendingApproval
  })

  if (!next) {
    return
  }

  if (next.approval) {
    await markPendingApproval(next)
    return
  }

  await executeRunRequest(next)
}

async function approvePendingRun() {
  if (!pendingApprovalRequest) {
    throw new Error('当前没有待确认的高风险运行。')
  }

  const next = pendingApprovalRequest
  pendingApprovalRequest = null
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  updateState(draft => {
    draft.run.pendingApproval = state.run.pendingApproval
    draft.run.queue = state.run.queue
  })
  pushLog('ui', `已批准高风险运行：${previewPrompt(next.prompt, 60)}`, 'warn')
  await executeRunRequest(next)
}

async function rejectPendingRun() {
  if (!pendingApprovalRequest) {
    throw new Error('当前没有待确认的高风险运行。')
  }

  const rejected = pendingApprovalRequest
  pendingApprovalRequest = null
  syncQueuedState()
  persistRuntimeQueueStateSoon()
  updateState(draft => {
    draft.run.pendingApproval = state.run.pendingApproval
    draft.run.queue = state.run.queue
    draft.timeline = [
      ...draft.timeline,
      {
        id: createId('approval-reject'),
        kind: 'status',
        status: 'warning',
        title: '高风险运行已取消',
        content: `已取消：${previewPrompt(rejected.prompt, 120)}`,
        timestamp: safeNow(),
      },
    ]
  })
  pushLog('ui', `已取消高风险运行：${previewPrompt(rejected.prompt, 60)}`, 'warn')
  await pumpRunQueue()
}

function launchRunRequest(request) {
  void Promise.resolve()
    .then(() => executeRunRequest(request))
    .catch(async error => {
      const message = formatUserFacingError(
        error instanceof Error ? error.message : String(error),
      )
      const timestamp = safeNow()
      const nextTranscript = [
        ...state.transcript,
        {
          id: createId('assistant-final'),
          role: 'assistant',
          entryType: 'assistant',
          title: 'Assistant',
          content: message,
          timestamp,
          streaming: false,
          isError: true,
        },
      ]
      trimArray(nextTranscript, 500)

      const nextTimeline = [
        ...state.timeline,
        {
          id: createId('result'),
          kind: 'result',
          status: 'error',
          title: '运行失败',
          content: message,
          timestamp,
        },
      ]
      trimArray(nextTimeline, 300)

      updateState(draft => {
        draft.status = draft.gateway.status === 'ready' ? 'ready' : 'idle'
        draft.run.status = 'idle'
        draft.run.endedAt = timestamp
        draft.run.exitCode = -1
        draft.run.lastResult = {
          totalCostUsd: null,
          numTurns: 0,
        }
        draft.transcript = nextTranscript
        draft.timeline = nextTimeline
      })

      pushLog('ui', `运行启动失败：${message}`, 'error')

      if (request.sessionId) {
        await saveAppSessionState({
          sessionId: request.sessionId,
          workspaceDir: request.workspaceDir,
          transcript: nextTranscript,
          toolCalls: state.toolCalls,
          timeline: nextTimeline,
          lastClawSessionId: state.run.resumeSessionId || null,
          runState: {
            status: 'failed',
            endedAt: timestamp,
            message,
            prompt: request.prompt,
            model: request.config.clawModel || request.config.upstreamModel || null,
            permissionMode: request.config.permissionMode || null,
            exitCode: -1,
          },
        })
      }
    })
}

async function startClawPrompt(body) {
  const config = normalizeConfig({ ...state.config, ...body.config })
  if (!config.upstreamBaseUrl || !config.upstreamModel) {
    throw new Error('请先提供上游接口地址和上游模型。')
  }

  let prompt = String(body.prompt || '').trim()
  if (!prompt) {
    throw new Error('输入内容不能为空。')
  }

  const skillMatch = resolveSkillPrompt(prompt)
  if (skillMatch) {
    pushLog('ui', `触发 skill: ${skillMatch.skill.name}`, 'info')
    prompt = skillMatch.injectedPrompt
  }

  const request = createRunRequest({ ...body, prompt }, config)

  if (
    state.run.status === 'running' ||
    persistentHost?.activeTurn ||
    (clawChild && clawChild.exitCode === null) ||
    pendingApprovalRequest
  ) {
    return {
      status: 'queued',
      entry: queueRunRequest(request),
    }
  }

  if (request.approval) {
    await markPendingApproval(request)
    return {
      status: 'pending-approval',
      approval: summarizePendingApproval(request),
    }
  }

  launchRunRequest(request)
  return {
    status: 'started',
  }
}

async function resetConversation() {
  if (state.run.status === 'running' || pendingApprovalRequest || runQueue.length > 0) {
    throw new Error('当前任务仍在运行，请先停止后再新建会话。')
  }

  await disposePersistentHost('新建会话')

  const nextSession = await createAppSession(state.config.workspaceDir)
  const latestAppSessions = await listAppSessions(state.config.workspaceDir)
  updateState(draft => {
    draft.run.sessionId = nextSession.sessionId
    draft.run.resumeSessionId = null
    draft.run.lastResult = null
    draft.run.contextMode = 'fresh'
    draft.run.contextMessageCount = 0
    draft.run.carriedMessageCount = 0
    draft.run.transcriptSource = 'live'
    draft.transcript = []
    draft.toolCalls = []
    draft.timeline = []
    draft.sessions.items = latestAppSessions
    draft.sessions.selectedSessionId = nextSession.sessionId
  })
  pushLog('ui', '会话已重置。')
}

async function shutdownChildren() {
  await stopClawRun()
  await disposePersistentHost('应用正在关闭')
  await stopGateway()
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${uiHost}:${uiPort}`)

  try {
    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, snapshotState())
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      })
      sseClients.add(res)
      res.write(`data: ${JSON.stringify({ type: 'state', state: snapshotState() })}\n\n`)
      req.on('close', () => sseClients.delete(res))
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/config') {
      await saveConfig(await readJson(req))
      await refreshSessions(state.config.workspaceDir, { silent: true })
      if (state.run.status !== 'running' && !pendingApprovalRequest && runQueue.length > 0) {
        await pumpRunQueue()
      }
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/test-connection') {
      const body = await readJson(req)
      const report = await runConnectionDiagnostics({
        ...state.config,
        ...body.config,
      })
      json(res, 200, report)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const result = await startClawPrompt(await readJson(req))
      json(res, 202, { ok: true, ...result })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      await stopClawRun()
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/approvals/approve') {
      await approvePendingRun()
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/approvals/reject') {
      await rejectPendingRun()
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/queue/clear') {
      await clearQueuedRuns()
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      await resetConversation()
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions/refresh') {
      await refreshSessions(state.config.workspaceDir)
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions/select') {
      const body = await readJson(req)
      await selectSession(body.sessionId || null)
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/diagnostics') {
      json(res, 200, await buildDiagnosticsReport())
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/diagnostics/export') {
      json(res, 200, {
        filename: `claw-code-diagnostics-${Date.now()}.json`,
        payload: await buildDiagnosticsExport(),
      })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions/rename') {
      const body = await readJson(req)
      const sessionId = String(body.sessionId || '').trim()
      const summary = String(body.summary || '').trim()
      if (!sessionId) {
        throw new Error('缺少会话 ID。')
      }
      if (!summary) {
        throw new Error('会话名称不能为空。')
      }
      await renameAppSession(sessionId, state.config.workspaceDir, summary)
      await refreshSessions(state.config.workspaceDir, { silent: true })
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions/delete') {
      const body = await readJson(req)
      const sessionId = String(body.sessionId || '').trim()
      if (!sessionId) {
        throw new Error('缺少会话 ID。')
      }
      if (state.run.status === 'running' || pendingApprovalRequest || runQueue.length > 0) {
        throw new Error('当前还有运行中、待审批或排队中的任务，请先处理完再删除会话。')
      }

      const deletingSelected = state.sessions.selectedSessionId === sessionId
      await deleteAppSession(sessionId, state.config.workspaceDir)

      if (deletingSelected) {
        updateState(draft => {
          draft.transcript = []
          draft.toolCalls = []
          draft.timeline = []
          draft.run.sessionId = null
          draft.run.resumeSessionId = null
          draft.run.contextMode = 'fresh'
          draft.run.contextMessageCount = 0
          draft.run.carriedMessageCount = 0
          draft.run.transcriptSource = 'session'
          draft.sessions.selectedSessionId = null
        })
      }

      let remaining = await listAppSessions(state.config.workspaceDir)
      if (remaining.length === 0) {
        await createAppSession(state.config.workspaceDir)
        remaining = await listAppSessions(state.config.workspaceDir)
      }

      await refreshSessions(state.config.workspaceDir)
      json(res, 200, { ok: true })
      return
    }

    /* ── Bootstrap (soul) endpoints ──────────────────────── */
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') {
      const files = await listBootstrapFiles(state.config.workspaceDir)
      json(res, 200, { files, totalChars: files.reduce((s, f) => s + f.charCount, 0) })
      return
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/bootstrap/')) {
      const filename = decodeURIComponent(url.pathname.slice('/api/bootstrap/'.length))
      const body = await readJson(req)
      const result = await saveBootstrapFile(state.config.workspaceDir, filename, body.content || '')
      json(res, 200, result)
      return
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/bootstrap/')) {
      const filename = decodeURIComponent(url.pathname.slice('/api/bootstrap/'.length))
      const result = await deleteBootstrapFile(state.config.workspaceDir, filename)
      json(res, 200, result)
      return
    }

    /* ── Memory endpoints ──────────────────────────────── */
    if (req.method === 'GET' && url.pathname === '/api/memory') {
      const overview = await getMemoryOverview(state.config.workspaceDir)
      json(res, 200, overview)
      return
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/memory/file/')) {
      const filename = decodeURIComponent(url.pathname.slice('/api/memory/file/'.length))
      const files = await loadMemoryFiles(state.config.workspaceDir, [filename])
      json(res, 200, files[0] || { error: 'Not found' })
      return
    }

    if (req.method === 'POST' && url.pathname.startsWith('/api/memory/file/')) {
      const filename = decodeURIComponent(url.pathname.slice('/api/memory/file/'.length))
      const body = await readJson(req)
      const result = await saveMemoryFile(state.config.workspaceDir, filename, body.content || '', body.frontmatter || {})
      json(res, 200, result)
      return
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/memory/file/')) {
      const filename = decodeURIComponent(url.pathname.slice('/api/memory/file/'.length))
      const result = await deleteMemoryFile(state.config.workspaceDir, filename)
      json(res, 200, result)
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/memory/search') {
      const body = await readJson(req)
      const manifest = await scanMemoryManifest(state.config.workspaceDir)
      const relevant = await findRelevantMemories(body.query || '', manifest, callGatewayLLM)
      const files = relevant.length > 0 ? await loadMemoryFiles(state.config.workspaceDir, relevant) : []
      json(res, 200, { results: files })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/memory/dream') {
      const result = await memoryRunDream(state.config.workspaceDir, appSessionsPath, callGatewayLLM, pushLog)
      if (result?.ok) {
        broadcast({ type: 'timeline_upsert', entry: { id: `dream-${Date.now()}`, kind: 'status', status: 'success', title: result.summary || '记忆整合完成', content: '', timestamp: new Date().toISOString() } })
      }
      json(res, 200, result || { ok: false })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/skills') {
      const list = [...loadedSkills.values()].map(s => ({ name: s.name, description: s.description, source: s.source }))
      json(res, 200, { skills: list })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/skills/reload') {
      await loadSkills(state.config.workspaceDir)
      const list = [...loadedSkills.values()].map(s => ({ name: s.name, description: s.description, source: s.source }))
      json(res, 200, { ok: true, skills: list })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      await shutdownChildren()
      json(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET') {
      await serveStatic(res, url.pathname)
      return
    }

    json(res, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushLog('ui', message, 'error')
    json(res, 500, { error: formatUserFacingError(message) })
  }
})

async function main() {
  await loadConfig()
  await repairInterruptedRuns()
  await loadRuntimeQueueState()
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(uiPort, uiHost, () => {
      server.off('error', reject)
      resolvePromise()
    })
  })
  console.log(`claw-code launcher UI running at http://${uiHost}:${uiPort}`)

  await refreshSessions(state.config.workspaceDir, { silent: true })

  // Resume the most recent session instead of always creating a new one
  const existingSessions = state.sessions.items || []
  if (existingSessions.length > 0) {
    const latest = existingSessions[0] // already sorted by lastModified desc
    await selectSession(latest.sessionId)
  } else {
    const freshSession = await createAppSession(state.config.workspaceDir)
    state.sessions.selectedSessionId = freshSession.sessionId
    state.run.sessionId = freshSession.sessionId
  }

  await loadSkills(state.config.workspaceDir)

  // Initialize bootstrap (soul / personality) system
  await initBootstrap(state.config.workspaceDir)

  // Initialize memory system
  await initMemory(state.config.workspaceDir)

  watchBootstrap(state.config.workspaceDir, () => {
    pushLog('ui', 'Bootstrap 文件已重新加载', 'info')
  })

  dreamTimer = setInterval(() => checkAndRunDream().catch(() => {}), DREAM_CHECK_INTERVAL_MS)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await shutdownChildren()
    server.close(() => process.exit(0))
  })
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
})
