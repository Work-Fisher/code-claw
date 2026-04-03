import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const MAX_READ_CHARS = 16000
const MAX_TOOL_OUTPUT = 20000
const SEARCH_SKIP_DIRS = new Set(['.git', 'node_modules', '.compatible-shell'])
const SEARCH_SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.zip',
  '.exe',
  '.dll',
  '.pdf',
])

export const TOOL_DEFINITIONS = [
  {
    name: 'list_dir',
    description: 'List files and directories under a workspace path.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path inside the workspace. Defaults to ".".',
        },
      },
    },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file from the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file inside the workspace.',
        },
        max_chars: {
          type: 'integer',
          description: `Optional maximum characters to return. Default ${MAX_READ_CHARS}.`,
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write a UTF-8 text file inside the workspace, creating parents if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative destination path inside the workspace.',
        },
        content: {
          type: 'string',
          description: 'Full file contents to write.',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'search_text',
    description: 'Search for a plain-text pattern across files in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Plain substring to search for.',
        },
        path: {
          type: 'string',
          description: 'Optional relative directory to search from.',
        },
        max_results: {
          type: 'integer',
          description: 'Optional maximum number of matches to return.',
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether the search should be case sensitive.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'shell_command',
    description:
      'Run a PowerShell command in the workspace root. This may require explicit user approval.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'PowerShell command to execute.',
        },
        timeout_ms: {
          type: 'integer',
          description: 'Optional timeout in milliseconds. Default 30000.',
        },
      },
      required: ['command'],
    },
  },
]

export async function executeToolCalls({
  workspaceDir,
  assistantContent,
  confirmShellCommand,
  printLog,
}) {
  const toolCalls = assistantContent.filter(block => block?.type === 'tool_use')
  const results = []

  for (const toolCall of toolCalls) {
    const input = isObject(toolCall.input) ? toolCall.input : {}
    const summary = `${toolCall.name} ${JSON.stringify(input)}`
    printLog(`[tool] ${summary}`)

    let payload
    let isError = false

    try {
      payload = await dispatchTool({
        workspaceDir,
        name: toolCall.name,
        input,
        confirmShellCommand,
      })
    } catch (error) {
      isError = true
      payload = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    const text =
      typeof payload === 'string'
        ? payload
        : JSON.stringify(payload, null, 2).slice(0, MAX_TOOL_OUTPUT)

    results.push({
      type: 'tool_result',
      tool_use_id: toolCall.id,
      content: text,
      ...(isError ? { is_error: true } : {}),
    })
  }

  return results
}

async function dispatchTool({ workspaceDir, name, input, confirmShellCommand }) {
  switch (name) {
    case 'list_dir':
      return listDir(workspaceDir, input)
    case 'read_file':
      return readFile(workspaceDir, input)
    case 'write_file':
      return writeFile(workspaceDir, input)
    case 'search_text':
      return searchText(workspaceDir, input)
    case 'shell_command':
      return runShellCommand(workspaceDir, input, confirmShellCommand)
    default:
      throw new Error(`Unsupported tool: ${name}`)
  }
}

async function listDir(workspaceDir, input) {
  const requestedPath = typeof input.path === 'string' && input.path ? input.path : '.'
  const absolutePath = resolveWorkspacePath(workspaceDir, requestedPath)
  const entries = await fs.readdir(absolutePath, { withFileTypes: true })

  return {
    ok: true,
    path: toWorkspaceRelative(workspaceDir, absolutePath),
    entries: entries
      .slice(0, 200)
      .map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      })),
  }
}

async function readFile(workspaceDir, input) {
  if (typeof input.path !== 'string' || !input.path) {
    throw new Error('read_file requires a path')
  }

  const absolutePath = resolveWorkspacePath(workspaceDir, input.path)
  const text = await fs.readFile(absolutePath, 'utf8')
  const maxChars =
    Number.isInteger(input.max_chars) && input.max_chars > 0
      ? Math.min(input.max_chars, MAX_READ_CHARS)
      : MAX_READ_CHARS

  return {
    ok: true,
    path: toWorkspaceRelative(workspaceDir, absolutePath),
    truncated: text.length > maxChars,
    content: text.slice(0, maxChars),
  }
}

async function writeFile(workspaceDir, input) {
  if (typeof input.path !== 'string' || !input.path) {
    throw new Error('write_file requires a path')
  }
  if (typeof input.content !== 'string') {
    throw new Error('write_file requires content')
  }

  const absolutePath = resolveWorkspacePath(workspaceDir, input.path)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, input.content, 'utf8')

  return {
    ok: true,
    path: toWorkspaceRelative(workspaceDir, absolutePath),
    bytesWritten: Buffer.byteLength(input.content, 'utf8'),
  }
}

async function searchText(workspaceDir, input) {
  if (typeof input.pattern !== 'string' || !input.pattern) {
    throw new Error('search_text requires a pattern')
  }

  const requestedPath = typeof input.path === 'string' && input.path ? input.path : '.'
  const absolutePath = resolveWorkspacePath(workspaceDir, requestedPath)
  const maxResults =
    Number.isInteger(input.max_results) && input.max_results > 0
      ? Math.min(input.max_results, 100)
      : 20
  const caseSensitive = input.case_sensitive === true
  const needle = caseSensitive ? input.pattern : input.pattern.toLowerCase()
  const matches = []

  await walkFiles(absolutePath, async filePath => {
    if (matches.length >= maxResults) {
      return false
    }

    const extension = path.extname(filePath).toLowerCase()
    if (SEARCH_SKIP_EXTENSIONS.has(extension)) {
      return true
    }

    const text = await fs.readFile(filePath, 'utf8').catch(() => null)
    if (!text) {
      return true
    }

    const lines = text.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const haystack = caseSensitive ? line : line.toLowerCase()
      if (!haystack.includes(needle)) {
        continue
      }

      matches.push({
        path: toWorkspaceRelative(workspaceDir, filePath),
        line: index + 1,
        snippet: line.slice(0, 240),
      })

      if (matches.length >= maxResults) {
        return false
      }
    }

    return true
  })

  return {
    ok: true,
    pattern: input.pattern,
    matches,
  }
}

async function runShellCommand(workspaceDir, input, confirmShellCommand) {
  if (typeof input.command !== 'string' || !input.command.trim()) {
    throw new Error('shell_command requires a command')
  }

  const timeoutMs =
    Number.isInteger(input.timeout_ms) && input.timeout_ms > 0
      ? Math.min(input.timeout_ms, 300000)
      : 30000

  const approved = await confirmShellCommand(input.command)
  if (!approved) {
    return {
      ok: false,
      approved: false,
      error: 'Shell command was not approved',
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', input.command],
      {
        cwd: workspaceDir,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    )

    return {
      ok: true,
      approved: true,
      exitCode: 0,
      stdout: truncateText(stdout),
      stderr: truncateText(stderr),
    }
  } catch (error) {
    return {
      ok: false,
      approved: true,
      exitCode: error?.code ?? null,
      stdout: truncateText(error?.stdout || ''),
      stderr: truncateText(error?.stderr || error?.message || ''),
      timedOut: Boolean(error?.killed),
    }
  }
}

async function walkFiles(rootDir, visitFile) {
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    const entries = await fs.readdir(current, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)

      if (entry.isDirectory()) {
        if (!SEARCH_SKIP_DIRS.has(entry.name)) {
          stack.push(fullPath)
        }
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const shouldContinue = await visitFile(fullPath)
      if (shouldContinue === false) {
        return
      }
    }
  }
}

function resolveWorkspacePath(workspaceDir, requestedPath) {
  const absoluteWorkspace = path.resolve(workspaceDir)
  const candidate = path.resolve(absoluteWorkspace, requestedPath)
  const relative = path.relative(absoluteWorkspace, candidate)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${requestedPath}`)
  }

  return candidate
}

function toWorkspaceRelative(workspaceDir, absolutePath) {
  const relative = path.relative(workspaceDir, absolutePath)
  return relative || '.'
}

function truncateText(text) {
  if (typeof text !== 'string') {
    return ''
  }
  return text.length > MAX_TOOL_OUTPUT
    ? `${text.slice(0, MAX_TOOL_OUTPUT)}\n...[truncated]`
    : text
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
