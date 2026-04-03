/**
 * Bootstrap system — multi-file personality / context injection.
 *
 * Inspired by OpenClaw's bootstrap chain (SOUL + IDENTITY + USER + CONTEXT).
 * Each file in {workspaceDir}/.claw/bootstrap/ is loaded, capped, and
 * assembled into a single prompt prefix that is injected before every turn.
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync, watchFile, unwatchFile } from 'node:fs'
import { platform, release, arch } from 'node:os'

// ── Limits (inspired by OpenClaw: 20K per file, 150K total) ──────────
const PER_FILE_CHAR_LIMIT = 20_000
const TOTAL_CHAR_LIMIT = 80_000
const WATCH_INTERVAL_MS = 2000

// ── Default SOUL template ────────────────────────────────────────────
const DEFAULT_SOUL = `# SOUL

## 我是谁

我是小龙虾（Code-Claw），你的个人 AI 助手。我运行在你的本地设备上，
通过飞书、桌面应用等渠道随时待命。我的记忆跨会话持久保存，
我会随着和你的互动不断进化。

## 核心原则

- **真实有用**：跳过客套话，直接解决问题。不说"好的，我来帮你"，直接做。
- **有自己的判断**：对技术方案有明确偏好和意见，不当复读机。
- **独立解决**：能自己搞定的不问用户，卡住了才请示。
- **记住一切**：用户说过的偏好、项目背景、做过的决策，我都记在 Memory 里。

## 行为边界

- **隐私绝对保护**：不泄露用户数据，不把对话内容发到任何外部服务。
- **外部操作先请示**：发消息、删文件、推代码之前，先确认。
- **不冒充用户**：在群聊中不代替用户发言。
- **不急躁**：消息平台的回复不需要即时，可以深思熟虑再回答。

## 风格

真正有用的助手——不卑不亢，不是企业客服也不是谄媚的聊天机器人。
简单问题简短回答，复杂问题给出深度分析。
默认中文，用户用英文时切英文。
`

// ── State ────────────────────────────────────────────────────────────
let cachedBootstrap = ''
let watchedDir = null

// ── Public API ───────────────────────────────────────────────────────

/**
 * Ensure bootstrap directory exists and create default files if missing.
 */
export async function initBootstrap(workspaceDir) {
  if (!workspaceDir) return
  const dir = bootstrapDir(workspaceDir)
  await mkdir(dir, { recursive: true })

  const soulPath = join(dir, 'SOUL.md')
  if (!existsSync(soulPath)) {
    await writeFile(soulPath, DEFAULT_SOUL, 'utf8')
  }

  // Auto-generate IDENTITY.md with runtime metadata
  await regenerateIdentity(dir)

  // Initial load
  cachedBootstrap = await assembleChain(dir)
}

/**
 * Return the cached bootstrap prompt string.
 */
export function getBootstrap() {
  return cachedBootstrap
}

/**
 * Load the full chain from disk (bypasses cache).
 */
export async function loadBootstrapChain(workspaceDir) {
  if (!workspaceDir) return ''
  cachedBootstrap = await assembleChain(bootstrapDir(workspaceDir))
  return cachedBootstrap
}

/**
 * Start watching bootstrap directory for changes. Calls `onChange` on reload.
 */
export async function watchBootstrap(workspaceDir, onChange) {
  if (!workspaceDir) return
  const dir = bootstrapDir(workspaceDir)
  if (watchedDir === dir) return // already watching

  // Stop previous watcher
  await unwatchBootstrap()
  watchedDir = dir

  let debounce = null
  const handler = () => {
    clearTimeout(debounce)
    debounce = setTimeout(async () => {
      try {
        cachedBootstrap = await assembleChain(dir)
        if (onChange) onChange(cachedBootstrap)
      } catch { /* ignore read errors during hot-reload */ }
    }, WATCH_INTERVAL_MS)
  }

  // Watch each file in the directory
  try {
    const entries = await readdir(dir)
    for (const name of entries) {
      if (name.endsWith('.md')) {
        watchFile(join(dir, name), { interval: WATCH_INTERVAL_MS }, handler)
      }
    }
  } catch { /* dir may not exist yet */ }
}

/**
 * Stop watching bootstrap files.
 */
export async function unwatchBootstrap() {
  if (!watchedDir) return
  try {
    const entries = await readdir(watchedDir)
    for (const name of entries) {
      if (name.endsWith('.md')) {
        unwatchFile(join(watchedDir, name))
      }
    }
  } catch { /* ignore */ }
  watchedDir = null
}

/**
 * List all bootstrap files with content and char count.
 */
export async function listBootstrapFiles(workspaceDir) {
  if (!workspaceDir) return []
  const dir = bootstrapDir(workspaceDir)
  const results = []
  try {
    const entries = await readdir(dir)
    for (const name of entries.sort()) {
      if (!name.endsWith('.md')) continue
      try {
        const content = await readFile(join(dir, name), 'utf8')
        results.push({ name, content, charCount: content.length })
      } catch { /* skip unreadable */ }
    }
  } catch { /* dir missing */ }
  return results
}

/**
 * Save a bootstrap file. Returns { ok, charCount }.
 */
export async function saveBootstrapFile(workspaceDir, filename, content) {
  if (!workspaceDir || !filename) throw new Error('Missing workspaceDir or filename')
  if (!filename.endsWith('.md')) filename += '.md'
  // Sanitize: prevent path traversal
  const safe = basename(filename)
  const dir = bootstrapDir(workspaceDir)
  await mkdir(dir, { recursive: true })
  const trimmed = content.slice(0, PER_FILE_CHAR_LIMIT)
  await writeFile(join(dir, safe), trimmed, 'utf8')
  // Refresh cache
  cachedBootstrap = await assembleChain(dir)
  return { ok: true, charCount: trimmed.length }
}

/**
 * Delete a bootstrap file (SOUL.md is protected).
 */
export async function deleteBootstrapFile(workspaceDir, filename) {
  if (!workspaceDir || !filename) throw new Error('Missing workspaceDir or filename')
  const safe = basename(filename)
  if (safe === 'SOUL.md') throw new Error('SOUL.md 不可删除')
  const { unlink } = await import('node:fs/promises')
  await unlink(join(bootstrapDir(workspaceDir), safe))
  cachedBootstrap = await assembleChain(bootstrapDir(workspaceDir))
  return { ok: true }
}

// ── Internals ────────────────────────────────────────────────────────

function bootstrapDir(workspaceDir) {
  return join(workspaceDir, '.claw', 'bootstrap')
}

/**
 * Re-generate IDENTITY.md with current runtime metadata.
 */
async function regenerateIdentity(dir) {
  const identity = `# IDENTITY

- **名称**: Code-Claw (小龙虾)
- **版本**: 0.2.0
- **平台**: ${platform()} ${release()} (${arch()})
- **时区**: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
- **日期**: ${new Date().toISOString().slice(0, 10)}
- **Node**: ${process.version}
`
  await writeFile(join(dir, 'IDENTITY.md'), identity, 'utf8')
}

/**
 * Read all .md files in the bootstrap dir, cap each, assemble in order:
 * SOUL → IDENTITY → USER → CONTEXT → (any others alphabetically)
 */
async function assembleChain(dir) {
  const priority = ['SOUL.md', 'IDENTITY.md', 'USER.md', 'CONTEXT.md']
  let entries = []

  try {
    const files = await readdir(dir)
    const mdFiles = files.filter(f => f.endsWith('.md'))

    // Sort: priority files first in order, then the rest alphabetically
    const sorted = [
      ...priority.filter(p => mdFiles.includes(p)),
      ...mdFiles.filter(f => !priority.includes(f)).sort(),
    ]

    for (const name of sorted) {
      try {
        let content = await readFile(join(dir, name), 'utf8')
        if (content.length > PER_FILE_CHAR_LIMIT) {
          content = content.slice(0, PER_FILE_CHAR_LIMIT) + '\n[...truncated]'
        }
        entries.push({ name, content })
      } catch { /* skip */ }
    }
  } catch { /* dir missing */ }

  // Assemble with total cap
  let assembled = ''
  for (const entry of entries) {
    const section = `<!-- ${entry.name} -->\n${entry.content}\n\n`
    if (assembled.length + section.length > TOTAL_CHAR_LIMIT) break
    assembled += section
  }

  return assembled.trim()
}
