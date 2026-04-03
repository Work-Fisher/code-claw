/**
 * Memory system — cross-session persistent memory with LLM-powered retrieval.
 *
 * Inspired by OpenClaw's layered memory architecture:
 *   - File layer: MEMORY.md index + topic files with frontmatter + daily logs
 *   - Search layer: LLM-driven relevance selection from manifest (Phase 1)
 *   - Vector layer: sqlite-vec hybrid search (Phase 2, not yet implemented)
 *
 * Four memory types (matching OpenClaw's taxonomy):
 *   user     — user profile, preferences, knowledge
 *   feedback — behavioral corrections and confirmations
 *   project  — ongoing work, goals, decisions
 *   reference — pointers to external resources
 */

import { readFile, writeFile, mkdir, readdir, stat, appendFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'

// ── Constants ────────────────────────────────────────────────────────
const MEMORY_INDEX = 'MEMORY.md'
const TOPICS_DIR = 'topics'
const LOGS_DIR = 'logs'
const MAX_INDEX_LINES = 200
const MAX_INDEX_BYTES = 25_000
const DREAM_MIN_HOURS = 24
const DREAM_MIN_SESSIONS = 3

// ── Public API ───────────────────────────────────────────────────────

/**
 * Ensure memory directory structure exists.
 */
export async function initMemory(workspaceDir) {
  if (!workspaceDir) return
  const memDir = memoryDir(workspaceDir)
  await mkdir(join(memDir, TOPICS_DIR), { recursive: true })
  await mkdir(join(memDir, LOGS_DIR), { recursive: true })

  const indexPath = join(memDir, MEMORY_INDEX)
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, '# Memory Index\n\n（暂无记忆）\n', 'utf8')
  }
}

/**
 * Load the MEMORY.md index, capped at MAX_INDEX_LINES / MAX_INDEX_BYTES.
 */
export async function loadMemoryIndex(workspaceDir) {
  if (!workspaceDir) return ''
  try {
    let content = await readFile(join(memoryDir(workspaceDir), MEMORY_INDEX), 'utf8')
    // Cap by bytes
    if (content.length > MAX_INDEX_BYTES) {
      content = content.slice(0, MAX_INDEX_BYTES) + '\n[...truncated]'
    }
    // Cap by lines
    const lines = content.split('\n')
    if (lines.length > MAX_INDEX_LINES) {
      content = lines.slice(0, MAX_INDEX_LINES).join('\n') + '\n[...truncated]'
    }
    return content
  } catch { return '' }
}

/**
 * Scan topics/ directory and extract frontmatter manifest.
 * Returns array of { filename, name, description, type, charCount, lastModified }.
 */
export async function scanMemoryManifest(workspaceDir) {
  if (!workspaceDir) return []
  const topicsPath = join(memoryDir(workspaceDir), TOPICS_DIR)
  const results = []

  try {
    const files = await readdir(topicsPath)
    for (const filename of files) {
      if (!filename.endsWith('.md')) continue
      try {
        const fullPath = join(topicsPath, filename)
        const content = await readFile(fullPath, 'utf8')
        const fm = parseFrontmatter(content)
        const fileStat = await stat(fullPath)
        results.push({
          filename,
          name: fm.name || filename.replace('.md', ''),
          description: fm.description || '',
          type: fm.type || 'project',
          charCount: content.length,
          lastModified: fileStat.mtime.toISOString(),
        })
      } catch { /* skip unreadable */ }
    }
  } catch { /* dir missing */ }

  return results
}

/**
 * Use LLM to find the most relevant memory files for a query.
 * Returns array of filenames (up to 5).
 * This is the OpenClaw pattern: zero native deps, works with any model.
 */
export async function findRelevantMemories(query, manifest, callLLM) {
  if (!manifest.length || !query || !callLLM) return []

  const manifestText = manifest
    .map(m => `- ${m.filename}: [${m.type}] ${m.name} — ${m.description}`)
    .join('\n')

  const systemPrompt = `你是一个记忆检索助手。根据用户的问题，从记忆文件清单中选出最相关的文件（最多 5 个）。
只返回文件名列表，每行一个，不要加任何解释。如果没有相关文件，返回空行。`

  const userPrompt = `用户问题：${query}

可用记忆文件：
${manifestText}

请返回最相关的文件名（每行一个，最多 5 个）：`

  const result = await callLLM(systemPrompt, userPrompt)
  if (!result) return []

  return result
    .split('\n')
    .map(line => line.replace(/^[-*\s]+/, '').trim())
    .filter(line => line.endsWith('.md') && manifest.some(m => m.filename === line))
    .slice(0, 5)
}

/**
 * Load specified memory files' full content.
 */
export async function loadMemoryFiles(workspaceDir, filenames) {
  if (!workspaceDir || !filenames?.length) return []
  const topicsPath = join(memoryDir(workspaceDir), TOPICS_DIR)
  const results = []

  for (const filename of filenames) {
    const safe = basename(filename)
    try {
      const content = await readFile(join(topicsPath, safe), 'utf8')
      const fm = parseFrontmatter(content)
      results.push({
        filename: safe,
        content,
        frontmatter: { name: fm.name || '', description: fm.description || '', type: fm.type || '' },
      })
    } catch { /* skip */ }
  }
  return results
}

/**
 * Load daily logs for recent days.
 */
export async function loadDailyLogs(workspaceDir, days = 2) {
  if (!workspaceDir) return ''
  const logsPath = join(memoryDir(workspaceDir), LOGS_DIR)
  const results = []

  for (let d = days - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400_000)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`
    const logPath = join(logsPath, String(year), month, `${dateStr}.md`)

    try {
      const content = await readFile(logPath, 'utf8')
      results.push(`## 日志 ${dateStr}\n${content}`)
    } catch { /* no log for this day */ }
  }

  return results.join('\n\n')
}

/**
 * Build the complete memory context block for prompt injection.
 * Orchestrates: index + relevant memories + daily logs.
 */
export async function buildMemoryContext(workspaceDir, query, callLLM) {
  if (!workspaceDir) return ''

  const parts = []

  // 1. Memory index (always loaded)
  const index = await loadMemoryIndex(workspaceDir)
  if (index && index !== '# Memory Index\n\n（暂无记忆）\n') {
    parts.push(`## 长期记忆索引\n${index}`)
  }

  // 2. Load memory files
  const manifest = await scanMemoryManifest(workspaceDir)
  if (manifest.length > 0) {
    if (callLLM && manifest.length > 8) {
      // Too many files — use LLM to pick the most relevant ones
      const relevant = await findRelevantMemories(query, manifest, callLLM)
      if (relevant.length > 0) {
        const files = await loadMemoryFiles(workspaceDir, relevant)
        for (const file of files) {
          parts.push(`## 记忆: ${file.frontmatter.name || file.filename}\n${file.content}`)
        }
      }
    } else {
      // Few files — load all of them directly (no LLM call, no latency)
      const allFiles = await loadMemoryFiles(workspaceDir, manifest.map(m => m.filename))
      for (const file of allFiles) {
        parts.push(`## 记忆: ${file.frontmatter.name || file.filename}\n${file.content}`)
      }
    }
  }

  // 3. Daily logs
  const logs = await loadDailyLogs(workspaceDir, 2)
  if (logs) {
    parts.push(logs)
  }

  if (parts.length === 0) return ''
  return parts.join('\n\n')
}

/**
 * Append an entry to today's daily log.
 */
export async function appendDailyLog(workspaceDir, sessionId, summary) {
  if (!workspaceDir || !summary) return
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateStr = `${year}-${month}-${day}`
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const dirPath = join(memoryDir(workspaceDir), LOGS_DIR, String(year), month)
  await mkdir(dirPath, { recursive: true })
  const logPath = join(dirPath, `${dateStr}.md`)

  const header = existsSync(logPath) ? '' : `# ${dateStr}\n\n`
  const entry = `## 会话 ${sessionId} (${time})\n${summary}\n\n`
  await appendFile(logPath, header + entry, 'utf8')
}

/**
 * Save a memory file with frontmatter.
 */
export async function saveMemoryFile(workspaceDir, filename, content, frontmatter = {}) {
  if (!workspaceDir || !filename) throw new Error('Missing workspaceDir or filename')
  const safe = basename(filename)
  if (!safe.endsWith('.md')) throw new Error('Filename must end with .md')

  const topicsPath = join(memoryDir(workspaceDir), TOPICS_DIR)
  await mkdir(topicsPath, { recursive: true })

  // Build content with frontmatter
  const fm = frontmatter
  const fmBlock = `---\nname: ${fm.name || safe.replace('.md', '')}\ndescription: ${fm.description || ''}\ntype: ${fm.type || 'project'}\n---\n\n`
  const fullContent = content.startsWith('---') ? content : fmBlock + content

  await writeFile(join(topicsPath, safe), fullContent, 'utf8')

  // Update MEMORY.md index
  await updateMemoryIndex(workspaceDir)
  return { ok: true }
}

/**
 * Delete a memory file.
 */
export async function deleteMemoryFile(workspaceDir, filename) {
  if (!workspaceDir || !filename) throw new Error('Missing workspaceDir or filename')
  const safe = basename(filename)
  const { unlink } = await import('node:fs/promises')
  await unlink(join(memoryDir(workspaceDir), TOPICS_DIR, safe))
  await updateMemoryIndex(workspaceDir)
  return { ok: true }
}

/**
 * Get full memory overview (for API endpoint).
 */
export async function getMemoryOverview(workspaceDir) {
  if (!workspaceDir) return { index: '', manifest: [], logs: '' }
  const index = await loadMemoryIndex(workspaceDir)
  const manifest = await scanMemoryManifest(workspaceDir)
  const logs = await loadDailyLogs(workspaceDir, 3)
  return { index, manifest, logs }
}

// ── Dream (memory consolidation) ────────────────────────────────────

/**
 * Check if conditions are met to run dream.
 */
export async function shouldRunDream(workspaceDir, runStatus, gatewayReady, appSessionsPath) {
  if (runStatus !== 'idle') return false
  if (!gatewayReady) return false
  if (!workspaceDir) return false

  const memDir = memoryDir(workspaceDir)

  // Lock check
  const lockPath = join(memDir, '.dream-lock')
  try {
    const lockStat = await stat(lockPath)
    if (Date.now() - lockStat.mtimeMs < 30 * 60 * 1000) return false
  } catch { /* no lock */ }

  // Time check
  const lastDreamPath = join(memDir, '.last-dream')
  let lastDreamAt = 0
  try { lastDreamAt = Number(await readFile(lastDreamPath, 'utf8')) } catch { /* first time */ }
  if (Date.now() - lastDreamAt < DREAM_MIN_HOURS * 3600_000) return false

  // Session count check
  try {
    const raw = await readFile(appSessionsPath, 'utf8')
    const sessions = JSON.parse(raw)
    const recentSessions = sessions.filter(s =>
      s.lastModified > lastDreamAt && s.transcript?.length > 2
    )
    return recentSessions.length >= DREAM_MIN_SESSIONS
  } catch { return false }
}

/**
 * Run dream — consolidate recent sessions into structured memory files.
 * Replaces the old flat MEMORY.md approach with frontmatter-based topic files.
 */
export async function runDream(workspaceDir, appSessionsPath, callLLM, pushLog) {
  const memDir = memoryDir(workspaceDir)
  const lockPath = join(memDir, '.dream-lock')
  const lastDreamPath = join(memDir, '.last-dream')

  await writeFile(lockPath, String(Date.now()), 'utf8')
  pushLog?.('ui', '正在整合记忆...', 'info')

  try {
    // Read recent sessions
    let raw = '[]'
    try { raw = await readFile(appSessionsPath, 'utf8') } catch { /* file may not exist yet */ }
    const sessions = JSON.parse(raw || '[]')
    let lastDreamAt = 0
    try { lastDreamAt = Number(await readFile(lastDreamPath, 'utf8')) } catch { /* */ }
    const recentSessions = sessions
      .filter(s => s.lastModified > lastDreamAt && s.transcript?.length > 2)
      .slice(0, 10)

    if (recentSessions.length === 0) {
      pushLog?.('ui', '没有足够的对话记录可供整合，请多聊几轮后再试。', 'info')
      return { summary: '没有需要整合的新对话', updates: 0 }
    }

    const summaries = recentSessions.map(s => {
      const msgs = (s.transcript || []).slice(0, 8)
        .map(e => `${e.role}: ${(e.content || '').slice(0, 300)}`)
        .join('\n')
      return `会话 ${s.summary || s.sessionId}:\n${msgs}`
    }).join('\n---\n')

    // Read existing memories
    const manifest = await scanMemoryManifest(workspaceDir)
    const existingMemories = []
    for (const m of manifest) {
      try {
        const content = await readFile(join(memDir, TOPICS_DIR, m.filename), 'utf8')
        existingMemories.push(`[${m.filename}] ${m.name} (${m.type}):\n${content.slice(0, 500)}`)
      } catch { /* skip */ }
    }

    const systemPrompt = `你是一个记忆整合代理。分析最近的会话，提取有价值的信息，更新到持久记忆中。

记忆类型：
- user: 用户画像、偏好、角色、知识
- feedback: 行为纠正和确认
- project: 项目上下文、目标、决策
- reference: 外部资源指针

输出格式（严格 JSON）：
{
  "updates": [
    { "filename": "user-preferences.md", "name": "用户偏好", "description": "交流和工具偏好", "type": "user", "content": "具体内容..." }
  ],
  "summary": "整合了 N 条新记忆"
}

规则：
- 只记录跨会话有价值的信息
- 不记录临时代码片段
- 合并重复，删除过时
- 每个文件的 content 不含 frontmatter`

    const userPrompt = `现有记忆文件：
${existingMemories.length > 0 ? existingMemories.join('\n\n') : '（空）'}

最近 ${recentSessions.length} 个会话：
${summaries}

请分析并返回需要更新的记忆（JSON 格式）：`

    const result = await callLLM(systemPrompt, userPrompt)
    if (!result) {
      pushLog?.('ui', '记忆整合：LLM 暂时无法响应，请稍后再试。', 'info')
      return { ok: true, summary: '暂无法整合，请稍后再试' }
    }

    // Parse JSON from result (handle markdown code blocks)
    let jsonStr = result
    const codeBlockMatch = result.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) jsonStr = codeBlockMatch[1]
    const parsed = JSON.parse(jsonStr.trim())

    // Write topic files
    for (const update of parsed.updates || []) {
      if (!update.filename || !update.content) continue
      const safe = basename(update.filename)
      if (!safe.endsWith('.md')) continue

      const fmBlock = `---\nname: ${update.name || safe.replace('.md', '')}\ndescription: ${update.description || ''}\ntype: ${update.type || 'project'}\n---\n\n`
      await mkdir(join(memDir, TOPICS_DIR), { recursive: true })
      await writeFile(join(memDir, TOPICS_DIR, safe), fmBlock + update.content, 'utf8')
    }

    // Update MEMORY.md index
    await updateMemoryIndex(workspaceDir)

    // Update timestamp
    await writeFile(lastDreamPath, String(Date.now()), 'utf8')

    const summary = parsed.summary || `整合了 ${(parsed.updates || []).length} 个记忆文件`
    pushLog?.('ui', `记忆整合完成：${summary}`, 'info')
    return { ok: true, summary }

  } catch (err) {
    pushLog?.('ui', `记忆整合失败: ${err.message}`, 'warn')
    return { ok: false, error: err.message }
  } finally {
    try { const { unlink } = await import('node:fs/promises'); await unlink(lockPath) } catch { /* */ }
  }
}

// ── Internals ────────────────────────────────────────────────────────

function memoryDir(workspaceDir) {
  return join(workspaceDir, '.claw', 'memory')
}

/**
 * Parse YAML-like frontmatter from markdown content.
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return {}

  const fm = {}
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

/**
 * Regenerate MEMORY.md index from all topic files.
 */
async function updateMemoryIndex(workspaceDir) {
  const manifest = await scanMemoryManifest(workspaceDir)
  if (manifest.length === 0) {
    await writeFile(
      join(memoryDir(workspaceDir), MEMORY_INDEX),
      '# Memory Index\n\n（暂无记忆）\n',
      'utf8',
    )
    return
  }

  const lines = ['# Memory Index', '']
  for (const m of manifest) {
    lines.push(`- [${m.name}](topics/${m.filename}) — ${m.description || m.type}`)
  }
  lines.push('')

  await writeFile(join(memoryDir(workspaceDir), MEMORY_INDEX), lines.join('\n'), 'utf8')
}
