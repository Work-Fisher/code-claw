import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const root = './recovered-claude-code/src'

function collectFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      collectFiles(fullPath, acc)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(fullPath)
    }
  }
  return acc
}

function findInsertionIndex(lines) {
  let i = 0
  let inBlockComment = false
  let inImport = false
  let insertionIndex = 0

  for (; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (inBlockComment) {
      insertionIndex = i + 1
      if (trimmed.includes('*/')) {
        inBlockComment = false
      }
      continue
    }

    if (inImport) {
      insertionIndex = i + 1
      if (
        trimmed.startsWith("import '") ||
        trimmed.startsWith('import "') ||
        trimmed.includes(" from '") ||
        trimmed.includes(' from "')
      ) {
        inImport = false
      }
      continue
    }

    if (!trimmed) {
      insertionIndex = i + 1
      continue
    }

    if (trimmed.startsWith('//')) {
      insertionIndex = i + 1
      continue
    }

    if (trimmed.startsWith('/*')) {
      insertionIndex = i + 1
      if (!trimmed.includes('*/')) {
        inBlockComment = true
      }
      continue
    }

    if (trimmed.startsWith('*') || trimmed.startsWith('*/')) {
      insertionIndex = i + 1
      continue
    }

    if (trimmed.startsWith('import ')) {
      insertionIndex = i + 1
      if (
        !trimmed.startsWith("import '") &&
        !trimmed.startsWith('import "') &&
        !trimmed.includes(" from '") &&
        !trimmed.includes(' from "')
      ) {
        inImport = true
      }
      continue
    }

    break
  }

  return insertionIndex
}

let updated = 0

for (const file of collectFiles(root)) {
  const source = readFileSync(file, 'utf8')
  if (!source.includes('require(') || source.includes("createRequire(import.meta.url)")) {
    continue
  }

  const lines = source.split(/\r?\n/)
  const insertionIndex = findInsertionIndex(lines)
  const shim = [
    "import { createRequire } from 'module'",
    'const require = createRequire(import.meta.url)',
    '',
  ]
  lines.splice(insertionIndex, 0, ...shim)
  writeFileSync(file, lines.join('\n'))
  updated++
}

console.log(`Injected createRequire shim into ${updated} files.`)
