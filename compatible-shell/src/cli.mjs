import { promises as fs } from 'fs'
import path from 'path'
import { createInterface } from 'readline/promises'
import process from 'process'
import { fileURLToPath } from 'url'
import { getClientConfig, sendMessages } from './client.mjs'
import { createSessionStore } from './session-store.mjs'
import { TOOL_DEFINITIONS, executeToolCalls } from './tools.mjs'

export async function runPromptOnce(options = {}) {
  const state = createState(options)
  await runUserTurn(options.prompt || '', state, null)
  return {
    messages: state.messages,
    sessionPath: state.sessionStore.sessionPath,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const initialPrompt = await getInitialPrompt(options)
  if (initialPrompt) {
    await runPromptOnce({
      ...options,
      prompt: initialPrompt,
    })
    return
  }

  const state = createState(options)
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('Compatible shell ready.')
  console.log(`Workspace: ${state.workspaceDir}`)
  console.log(`Model endpoint: ${state.clientConfig.baseUrl}`)
  console.log(`Model: ${state.clientConfig.model}`)
  console.log(`Session file: ${state.sessionStore.sessionPath}`)
  console.log('Type /help for commands.')

  while (true) {
    const line = (await rl.question('compat> ')).trim()
    if (!line) {
      continue
    }

    if (line.startsWith('/')) {
      const shouldExit = await handleSlashCommand(line, state)
      if (shouldExit) {
        break
      }
      continue
    }

    await runUserTurn(line, state, rl)
  }

  await persistSession(state)
  rl.close()
}

function createState(options = {}) {
  const workspaceDir = path.resolve(
    options.cwd || process.env.COMPAT_SHELL_WORKSPACE_DIR || process.cwd(),
  )
  const clientConfig = getClientConfig({
    baseUrl: options.baseUrl || process.env.ANTHROPIC_BASE_URL,
    apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
    model: options.model || process.env.ANTHROPIC_MODEL,
    maxTokens:
      options.maxTokens ||
      parsePositiveInt(process.env.COMPAT_SHELL_MAX_TOKENS, undefined),
  })

  return {
    messages: [],
    workspaceDir,
    clientConfig,
    maxToolRounds: parsePositiveInt(
      options.maxToolRounds || process.env.COMPAT_SHELL_MAX_TOOL_ROUNDS,
      6,
    ),
    autoApproveShell:
      options.autoApproveShell === true ||
      process.env.COMPAT_SHELL_AUTO_APPROVE_SHELL === '1',
    sessionStore: createSessionStore(workspaceDir),
    noSave: options.noSave === true || process.env.COMPAT_SHELL_NO_SAVE === '1',
  }
}

async function runUserTurn(prompt, state, rl) {
  state.messages.push({
    role: 'user',
    content: [{ type: 'text', text: prompt }],
  })

  for (let round = 0; round < state.maxToolRounds; round += 1) {
    const response = await sendMessages({
      ...state.clientConfig,
      system: buildSystemPrompt(state.workspaceDir),
      messages: state.messages,
      tools: TOOL_DEFINITIONS,
      maxTokens: state.clientConfig.maxTokens,
    })

    const assistantContent = normalizeAssistantContent(response.content)
    state.messages.push({
      role: 'assistant',
      content: assistantContent,
    })

    printAssistantText(assistantContent)

    const hasToolCalls = assistantContent.some(block => block.type === 'tool_use')
    if (!hasToolCalls) {
      await persistSession(state)
      return
    }

    const toolResults = await executeToolCalls({
      workspaceDir: state.workspaceDir,
      assistantContent,
      confirmShellCommand: command => confirmShellCommand(command, state, rl),
      printLog: message => console.log(message),
    })

    state.messages.push({
      role: 'user',
      content: toolResults,
    })
  }

  console.error('Reached the maximum tool rounds for this turn.')
  await persistSession(state)
}

async function handleSlashCommand(line, state) {
  switch (line) {
    case '/help':
      printRuntimeHelp()
      return false
    case '/tools':
      for (const tool of TOOL_DEFINITIONS) {
        console.log(`- ${tool.name}: ${tool.description}`)
      }
      return false
    case '/config':
      console.log(
        JSON.stringify(
          {
            workspaceDir: state.workspaceDir,
            baseUrl: state.clientConfig.baseUrl,
            model: state.clientConfig.model,
            maxTokens: state.clientConfig.maxTokens,
            maxToolRounds: state.maxToolRounds,
            autoApproveShell: state.autoApproveShell,
            sessionPath: state.sessionStore.sessionPath,
          },
          null,
          2,
        ),
      )
      return false
    case '/clear':
      state.messages.length = 0
      console.log('Conversation cleared.')
      return false
    case '/save':
      console.log(`Saved session to ${await persistSession(state)}`)
      return false
    case '/exit':
    case '/quit':
      return true
    default:
      console.log(`Unknown command: ${line}`)
      console.log('Type /help for available commands.')
      return false
  }
}

async function confirmShellCommand(command, state, rl) {
  if (state.autoApproveShell) {
    return true
  }

  if (!rl) {
    return false
  }

  const answer = await rl.question(
    `[shell_command approval]\n${command}\nRun this command? [y/N] `,
  )
  return /^y(es)?$/i.test(answer.trim())
}

async function persistSession(state) {
  if (state.noSave) {
    return state.sessionStore.sessionPath
  }

  return state.sessionStore.save({
    savedAt: new Date().toISOString(),
    workspaceDir: state.workspaceDir,
    model: state.clientConfig.model,
    baseUrl: state.clientConfig.baseUrl,
    messages: state.messages,
  })
}

function normalizeAssistantContent(content) {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }

  if (!Array.isArray(content)) {
    return []
  }

  return content
    .map(block => {
      if (block?.type === 'text') {
        return {
          type: 'text',
          text: typeof block.text === 'string' ? block.text : '',
        }
      }

      if (block?.type === 'tool_use') {
        return {
          type: 'tool_use',
          id: block.id || `toolu_${Date.now()}`,
          name: block.name || 'tool',
          input:
            typeof block.input === 'object' && block.input !== null ? block.input : {},
        }
      }

      return null
    })
    .filter(Boolean)
}

function printAssistantText(content) {
  const text = content
    .filter(block => block.type === 'text')
    .map(block => block.text.trim())
    .filter(Boolean)
    .join('\n')

  if (text) {
    console.log(text)
  }
}

function buildSystemPrompt(workspaceDir) {
  return [
    'You are a compatible coding assistant inspired by Claude Code.',
    'You run inside a terminal-like shell with local tools.',
    'Be concise, inspect before editing, and use tools when they would make the answer more reliable.',
    'When writing files, write the complete file contents.',
    'Use shell_command only when other tools are not enough.',
    `Workspace root: ${workspaceDir}`,
  ].join('\n')
}

async function getInitialPrompt(options) {
  if (options.prompt) {
    return options.prompt
  }

  if (!process.stdin.isTTY) {
    const text = await fs.readFile(process.stdin.fd, 'utf8').catch(() => '')
    return text.trim()
  }

  return ''
}

function parseArgs(argv) {
  const options = {
    promptParts: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--cwd') {
      options.cwd = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--max-tool-rounds') {
      options.maxToolRounds = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--auto-approve-shell') {
      options.autoApproveShell = true
      continue
    }
    if (arg === '--prompt') {
      options.promptParts.push(argv[index + 1] || '')
      index += 1
      continue
    }

    options.promptParts.push(arg)
  }

  options.prompt = options.promptParts.join(' ').trim()
  return options
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function printHelp() {
  console.log(`Compatible shell

Usage:
  npm run compat-shell -- [options] [prompt]

Options:
  --cwd <path>               Workspace root for local tools
  --max-tool-rounds <n>      Maximum tool loops per turn
  --auto-approve-shell       Approve shell_command automatically
  --prompt "<text>"          Run one prompt and exit
  --help                     Show this help
`)
}

function printRuntimeHelp() {
  console.log(`Commands:
  /help    Show runtime help
  /tools   List available local tools
  /config  Show active configuration
  /clear   Clear the current conversation
  /save    Save the transcript immediately
  /exit    Exit the shell`)
}

function isMainModule() {
  const currentFile = fileURLToPath(import.meta.url)
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : ''
  return currentFile === entry
}

if (isMainModule()) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exitCode = 1
  })
}
