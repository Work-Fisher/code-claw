import { createRequire } from 'module'
import { promises as fs } from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { isBuiltin } = require('module')

const DEFAULT_SOURCE_DIR =
  process.env.CLAUDE_DUMP_SRC || String.raw`F:\疑似克劳德源码\src`
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'recovered-claude-code')

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const sourceDir = path.resolve(options.source ?? DEFAULT_SOURCE_DIR)
  const outDir = path.resolve(options.out ?? DEFAULT_OUTPUT_DIR)
  const outSrcDir = path.join(outDir, 'src')

  await assertDirectory(sourceDir)
  await fs.mkdir(outSrcDir, { recursive: true })

  const files = await walk(sourceDir)
  const stats = {
    sourceDir,
    outDir,
    totalFiles: 0,
    recoveredFromInlineMap: 0,
    copiedAsFallback: 0,
    skippedBinaryLike: 0,
    errors: [],
  }

  const dependencyRoots = new Set()
  const fileEntries = []

  for (const filePath of files) {
    const relPath = path.relative(sourceDir, filePath)
    const destPath = path.join(outSrcDir, relPath)
    stats.totalFiles += 1

    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      const buffer = await fs.readFile(filePath)

      if (!isTextLike(filePath)) {
        await fs.writeFile(destPath, buffer)
        stats.skippedBinaryLike += 1
        fileEntries.push({
          relPath,
          mode: 'binary-copy',
        })
        continue
      }

      const text = buffer.toString('utf8')
      const recovered = extractInlineSource(text)

      if (recovered) {
        await fs.writeFile(destPath, recovered.content, 'utf8')
        stats.recoveredFromInlineMap += 1
        collectDependencyRoots(recovered.content, dependencyRoots)
        fileEntries.push({
          relPath,
          mode: 'inline-sourcemap',
          sourcemapSource: recovered.sourceName,
        })
      } else {
        await fs.writeFile(destPath, text, 'utf8')
        stats.copiedAsFallback += 1
        collectDependencyRoots(text, dependencyRoots)
        fileEntries.push({
          relPath,
          mode: 'fallback-copy',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      stats.errors.push({ relPath, message })
    }
  }

  const deps = Array.from(dependencyRoots).sort()

  await writeGeneratedProjectFiles(outDir, {
    sourceDir,
    stats,
    dependencies: deps,
  })

  await fs.writeFile(
    path.join(outDir, 'recovery-manifest.json'),
    JSON.stringify(
      {
        summary: stats,
        files: fileEntries,
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log(
    [
      `Recovered project written to: ${outDir}`,
      `Files scanned: ${stats.totalFiles}`,
      `Recovered from inline sourcemaps: ${stats.recoveredFromInlineMap}`,
      `Fallback copies: ${stats.copiedAsFallback}`,
      `Binary-like copies: ${stats.skippedBinaryLike}`,
      `Unique dependency roots: ${deps.length}`,
      `Errors: ${stats.errors.length}`,
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--source') {
      options.source = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--out') {
      options.out = argv[i + 1]
      i += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

async function assertDirectory(dirPath) {
  const stat = await fs.stat(dirPath)
  if (!stat.isDirectory()) {
    throw new Error(`Expected directory: ${dirPath}`)
  }
}

async function walk(rootDir) {
  const results = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }
  }

  results.sort()
  return results
}

function isTextLike(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return (
    ext === '.ts' ||
    ext === '.tsx' ||
    ext === '.js' ||
    ext === '.jsx' ||
    ext === '.mjs' ||
    ext === '.cjs' ||
    ext === '.json' ||
    ext === '.md' ||
    ext === '.txt'
  )
}

function extractInlineSource(text) {
  const matches = Array.from(
    text.matchAll(
      /\/\/# sourceMappingURL=data:application\/json(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)\s*$/gm,
    ),
  )
  const encoded = matches.at(-1)?.[1]
  if (!encoded) {
    return null
  }

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    const map = JSON.parse(decoded)
    if (!Array.isArray(map.sourcesContent) || map.sourcesContent.length === 0) {
      return null
    }

    const content =
      typeof map.sourcesContent[0] === 'string' ? map.sourcesContent[0] : null
    if (!content) {
      return null
    }

    return {
      content,
      sourceName: Array.isArray(map.sources) ? map.sources[0] ?? null : null,
    }
  } catch {
    return null
  }
}

function collectDependencyRoots(sourceText, dependencyRoots) {
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\b[^\n]*?\bfrom\s+['"]([^./][^'"]*)['"]/g,
    /(?:^|\n)\s*(?:const|let|var)\b[^\n]*?=\s*require\(['"]([^./][^'"]*)['"]\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of sourceText.matchAll(pattern)) {
      const specifier = match[1]
      const root = toDependencyRoot(specifier)
      if (!root) {
        continue
      }
      dependencyRoots.add(root)
    }
  }
}

function toDependencyRoot(specifier) {
  if (!specifier) {
    return null
  }
  if (specifier.startsWith('src/')) {
    return null
  }
  if (specifier.startsWith('node:') || specifier.startsWith('bun:')) {
    return null
  }
  if (isBuiltin(specifier)) {
    return null
  }

  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }

  return specifier.split('/')[0]
}

async function writeGeneratedProjectFiles(outDir, context) {
  const { sourceDir, stats, dependencies } = context

  await fs.writeFile(
    path.join(outDir, 'dependencies.generated.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dependencyRoots: dependencies,
      },
      null,
      2,
    ),
    'utf8',
  )

  const dependencyMap = Object.fromEntries(dependencies.map(dep => [dep, '*']))

  await fs.writeFile(
    path.join(outDir, 'package.generated.json'),
    JSON.stringify(
      {
        name: 'recovered-claude-code',
        private: true,
        version: '0.0.0-recovered',
        type: 'module',
        packageManager: 'bun@latest',
        scripts: {
          dev: 'bun run src/entrypoints/cli.tsx',
          gateway: 'node ../tools/model-gateway/server.mjs',
        },
        devDependencies: {
          typescript: '*',
        },
        dependencies: dependencyMap,
      },
      null,
      2,
    ),
    'utf8',
  )

  await fs.writeFile(
    path.join(outDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowJs: true,
          checkJs: false,
          jsx: 'react-jsx',
          baseUrl: '.',
          paths: {
            'src/*': ['src/*'],
          },
          skipLibCheck: true,
          resolveJsonModule: true,
          esModuleInterop: true,
          types: ['node'],
        },
        include: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
      },
      null,
      2,
    ),
    'utf8',
  )

  const gatewayEnvExample = [
    'OPENAI_COMPAT_BASE_URL=https://your-openai-compatible-endpoint',
    'OPENAI_COMPAT_API_KEY=sk-...',
    'OPENAI_COMPAT_MODEL=your-model-name',
    'OPENAI_COMPAT_CHAT_PATH=/chat/completions',
    'GATEWAY_HOST=127.0.0.1',
    'GATEWAY_PORT=8787',
    'ANTHROPIC_BASE_URL=http://127.0.0.1:8787',
    'ANTHROPIC_API_KEY=dummy',
    '',
  ].join('\n')

  await fs.writeFile(
    path.join(outDir, '.env.gateway.example'),
    gatewayEnvExample,
    'utf8',
  )

  const notes = [
    '# Recovery Notes',
    '',
    `- Source root: \`${sourceDir}\``,
    `- Output root: \`${outDir}\``,
    `- Total files scanned: ${stats.totalFiles}`,
    `- Files recovered from inline sourcemaps: ${stats.recoveredFromInlineMap}`,
    `- Fallback copies used: ${stats.copiedAsFallback}`,
    `- Binary-like files copied without sourcemap recovery: ${stats.skippedBinaryLike}`,
    `- Recovery errors: ${stats.errors.length}`,
    '',
    '## External model gateway',
    '',
    'Point the recovered project at the local Anthropic-compatible gateway:',
    '',
    '```powershell',
    '$env:ANTHROPIC_BASE_URL="http://127.0.0.1:8787"',
    '$env:ANTHROPIC_API_KEY="dummy"',
    '```',
    '',
    'Then configure the gateway upstream:',
    '',
    '```powershell',
    '$env:OPENAI_COMPAT_BASE_URL="https://your-openai-compatible-endpoint"',
    '$env:OPENAI_COMPAT_API_KEY="sk-..."',
    '$env:OPENAI_COMPAT_MODEL="your-model-name"',
    'npm run gateway',
    '```',
    '',
    '## Important limits',
    '',
    '- The recovered source still contains `bun:bundle` imports, so the candidate runtime is closer to Bun than plain Node.',
    '- `package.generated.json` is a candidate manifest, not a version-accurate original.',
    '- Private Anthropic-only packages and internal infrastructure will still need stubbing or replacement.',
    '- The model gateway currently focuses on text and tool-call flows first.',
    '',
  ].join('\n')

  await fs.writeFile(path.join(outDir, 'RECOVERY_NOTES.md'), notes, 'utf8')
}

main().catch(error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
