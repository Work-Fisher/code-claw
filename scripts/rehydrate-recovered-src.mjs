import fs from 'node:fs/promises'
import path from 'node:path'

const SOURCE_ROOT = 'F:/疑似克劳德源码/src'
const TARGET_ROOT = './recovered-claude-code/src'
const MARKER =
  '//# sourceMappingURL=data:application/json;charset=utf-8;base64,'

const EXCLUDED = new Set([
  'entrypoints/cli.tsx',
  'utils/slowOperations.ts',
])

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(fullPath)
      continue
    }
    yield fullPath
  }
}

function normalizeRel(filePath) {
  return path.relative(SOURCE_ROOT, filePath).replaceAll('\\', '/')
}

function pickSourceIndex(map, relPath) {
  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
    return -1
  }

  const relBasename = path.posix.basename(relPath)

  let index = map.sources.findIndex(source => {
    if (typeof source !== 'string') return false
    return source.replaceAll('\\', '/').endsWith(relPath)
  })
  if (index >= 0) return index

  index = map.sources.findIndex(source => {
    if (typeof source !== 'string') return false
    return path.posix.basename(source.replaceAll('\\', '/')) === relBasename
  })
  if (index >= 0) return index

  return map.sources.length === 1 ? 0 : -1
}

function applyCompatRewrites(sourceText) {
  return sourceText
    .replaceAll("from 'bun:bundle'", "from 'src/shims/bun-bundle.js'")
    .replaceAll('from "bun:bundle"', 'from "src/shims/bun-bundle.js"')
}

async function main() {
  let scanned = 0
  let rehydrated = 0
  let skipped = 0
  const failures = []

  for await (const filePath of walk(SOURCE_ROOT)) {
    const relPath = normalizeRel(filePath)
    if (!/\.(ts|tsx)$/.test(relPath)) continue

    scanned++
    if (EXCLUDED.has(relPath)) {
      skipped++
      continue
    }

    let fileText
    try {
      fileText = await fs.readFile(filePath, 'utf8')
    } catch (error) {
      failures.push({ relPath, stage: 'read', error: String(error) })
      continue
    }

    const markerIndex = fileText.lastIndexOf(MARKER)
    if (markerIndex < 0) {
      continue
    }

    try {
      const mapJson = Buffer.from(
        fileText.slice(markerIndex + MARKER.length),
        'base64',
      ).toString('utf8')
      const map = JSON.parse(mapJson)
      const sourceIndex = pickSourceIndex(map, relPath)
      if (sourceIndex < 0 || typeof map.sourcesContent?.[sourceIndex] !== 'string') {
        failures.push({ relPath, stage: 'pick-source', error: 'No matching sourcesContent entry' })
        continue
      }

      const targetPath = path.join(TARGET_ROOT, relPath)
      const nextText = applyCompatRewrites(map.sourcesContent[sourceIndex])
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, nextText, 'utf8')
      rehydrated++
    } catch (error) {
      failures.push({ relPath, stage: 'decode', error: String(error) })
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned,
        rehydrated,
        skipped,
        failures: failures.slice(0, 20),
        failureCount: failures.length,
      },
      null,
      2,
    ),
  )

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

await main()
