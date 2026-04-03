import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } from 'electron'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const preloadPath = path.join(__dirname, 'preload.cjs')
const launcherScript = path.join(rootDir, 'tools', 'claw-launcher-ui', 'server.mjs')
const publicDir = path.join(rootDir, 'ai-code-studio', 'dist')
const packageJsonPath = path.join(rootDir, 'package.json')
const iconPath = path.join(rootDir, 'assets', 'claw-code.png')
const uiHost = process.env.CLAW_UI_HOST || '127.0.0.1'
const uiPort = Number.parseInt(process.env.CLAW_UI_PORT || '8891', 10)
const uiUrl = `http://${uiHost}:${uiPort}`

let mainWindow = null
let launcherChild = null
let launcherReadyPromise = null
let launcherHealthTimer = null
let restartingLauncher = false
let appIsQuitting = false
let productMeta = null

function logDesktop(message) {
  console.log(`[desktop] ${message}`)
}

async function loadProductMeta() {
  if (productMeta) {
    return productMeta
  }

  try {
    const raw = await readFile(packageJsonPath, 'utf8')
    const pkg = JSON.parse(raw)
    productMeta = {
      productName: app.getName() || pkg.productName || 'claw-code',
      version: app.getVersion() || pkg.version || '0.1.0',
      description:
        pkg.description || 'Desktop launcher for the local claw-code runtime.',
      electronVersion: process.versions.electron || '',
      nodeVersion: process.versions.node || '',
      chromeVersion: process.versions.chrome || '',
      platform: `${process.platform} ${process.arch}`,
      launcherUrl: uiUrl,
      userDataPath: app.getPath('userData'),
    }
  } catch {
    productMeta = {
      productName: app.getName() || 'claw-code',
      version: app.getVersion() || '0.1.0',
      description: 'Desktop launcher for the local claw-code runtime.',
      electronVersion: process.versions.electron || '',
      nodeVersion: process.versions.node || '',
      chromeVersion: process.versions.chrome || '',
      platform: `${process.platform} ${process.arch}`,
      launcherUrl: uiUrl,
      userDataPath: app.getPath('userData'),
    }
  }

  return productMeta
}

function sendAppCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('claw:desktop:command', {
    type: 'menu-command',
    command,
  })
}

function buildApplicationMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建会话',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendAppCommand('new-session'),
        },
        {
          label: '刷新会话',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendAppCommand('refresh-sessions'),
        },
        { type: 'separator' },
        {
          label: '退出',
          role: 'quit',
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendAppCommand('open-settings'),
        },
        {
          label: '诊断',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => sendAppCommand('toggle-diagnostics'),
        },
        {
          label: '日志',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => sendAppCommand('toggle-logs'),
        },
        { type: 'separator' },
        {
          label: '重新加载界面',
          role: 'reload',
        },
        {
          label: '切换开发者工具',
          role: 'toggleDevTools',
        },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '启动向导',
          click: () => sendAppCommand('open-wizard'),
        },
        {
          label: '重启本地主机',
          click: () => sendAppCommand('restart-launcher'),
        },
        { type: 'separator' },
        {
          label: '关于 claw-code',
          click: () => sendAppCommand('open-about'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function ensureUserDataDir() {
  await mkdir(app.getPath('userData'), { recursive: true })
}

function secretStorePath() {
  return path.join(app.getPath('userData'), 'secure-store.json')
}

async function readSecretStore() {
  try {
    await ensureUserDataDir()
    const raw = await readFile(secretStorePath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeSecretStore(store) {
  await ensureUserDataDir()
  await writeFile(secretStorePath(), JSON.stringify(store, null, 2), 'utf8')
}

function encodeSecret(value) {
  if (!value) {
    return null
  }
  if (safeStorage.isEncryptionAvailable()) {
    return {
      mode: 'safeStorage',
      value: safeStorage.encryptString(value).toString('base64'),
    }
  }
  return {
    mode: 'plain',
    value,
  }
}

function decodeSecret(record) {
  if (!record?.value) {
    return ''
  }
  if (record.mode === 'safeStorage') {
    try {
      return safeStorage.decryptString(Buffer.from(record.value, 'base64'))
    } catch {
      return ''
    }
  }
  return String(record.value || '')
}

async function getSecret(key) {
  const store = await readSecretStore()
  return decodeSecret(store[key])
}

async function setSecret(key, value) {
  const store = await readSecretStore()
  if (!value) {
    delete store[key]
  } else {
    store[key] = encodeSecret(value)
  }
  await writeSecretStore(store)
}

async function waitForLauncher(url, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${url}/api/state`)
      if (response.ok) {
        return
      }
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Launcher UI did not become ready at ${url}`)
}

function spawnLauncher() {
  if (launcherChild && launcherChild.exitCode === null) {
    return
  }

  launcherChild = spawn(process.execPath, [launcherScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      CLAW_UI_PUBLIC_DIR: publicDir,
      CLAW_UI_HOST: uiHost,
      CLAW_UI_PORT: String(uiPort),
      CLAW_UI_DESKTOP: '1',
      CLAW_ROOT_DIR: rootDir,
      CLAW_DATA_DIR: path.join(app.getPath('userData'), 'data'),
      CLAW_BINARY_PATH: path.join(rootDir, 'claw-code', 'rust', 'target', 'release', process.platform === 'win32' ? 'claw.exe' : 'claw'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  launcherChild.stdout?.on('data', chunk => {
    process.stdout.write(`[launcher] ${chunk}`)
  })
  launcherChild.stderr?.on('data', chunk => {
    process.stderr.write(`[launcher] ${chunk}`)
  })
  launcherChild.on('exit', code => {
    logDesktop(`launcher exited with code ${String(code)}`)
    launcherChild = null
    launcherReadyPromise = null
    if (!appIsQuitting && mainWindow && !mainWindow.isDestroyed()) {
      void restartLauncher('Launcher exited unexpectedly. Restarting local host...')
    }
  })
}

async function stopLauncher() {
  if (!launcherChild || launcherChild.exitCode !== null) {
    return
  }

  launcherChild.kill('SIGTERM')
  await new Promise(resolve => {
    launcherChild.once('exit', resolve)
    setTimeout(resolve, 3000)
  })
  launcherChild = null
  launcherReadyPromise = null
}

async function ensureLauncherReady() {
  if (launcherReadyPromise) {
    return launcherReadyPromise
  }

  spawnLauncher()
  launcherReadyPromise = waitForLauncher(uiUrl)
    .then(() => uiUrl)
    .finally(() => {
      launcherReadyPromise = null
    })

  return launcherReadyPromise
}

async function restartLauncher(reason = 'Restarting local host...') {
  if (restartingLauncher) {
    return
  }

  restartingLauncher = true
  try {
    logDesktop(reason)
    await stopLauncher()
    await ensureLauncherReady()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('claw:desktop:host-status', {
        type: 'launcher-restarted',
        message: reason,
      })
    }
  } finally {
    restartingLauncher = false
  }
}

function startLauncherHealthMonitor() {
  if (launcherHealthTimer) {
    return
  }

  launcherHealthTimer = setInterval(async () => {
    if (restartingLauncher || !mainWindow || mainWindow.isDestroyed()) {
      return
    }

    try {
      const response = await fetch(`${uiUrl}/api/state`)
      if (!response.ok) {
        throw new Error(`Host returned ${response.status}`)
      }
    } catch {
      await restartLauncher('Local host was unreachable. Restarting it now...')
    }
  }, 5000)
}

function stopLauncherHealthMonitor() {
  if (launcherHealthTimer) {
    clearInterval(launcherHealthTimer)
    launcherHealthTimer = null
  }
}

async function createMainWindow() {
  await ensureLauncherReady()
  await loadProductMeta()
  startLauncherHealthMonitor()

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#F6F1E8',
    show: false,
    title: 'claw-code',
    icon: iconPath,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#F7F4EC',
      symbolColor: '#5C5247',
      height: 36,
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  await mainWindow.loadURL(uiUrl)
  buildApplicationMenu()
}

function registerIpc() {
  ipcMain.handle('claw:desktop:get-bootstrap', async () => {
    const appInfo = await loadProductMeta()
    return {
      isDesktop: true,
      upstreamApiKey: await getSecret('upstreamApiKey'),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      appInfo,
    }
  })

  ipcMain.handle('claw:desktop:set-secret', async (_event, payload) => {
    await setSecret(payload.key, payload.value)
    return { ok: true }
  })

  ipcMain.handle('claw:desktop:pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('claw:desktop:pick-file', async (_event, payload) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: payload?.filters || [],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('claw:desktop:save-text-file', async (_event, payload) => {
    const result = await dialog.showSaveDialog({
      defaultPath: payload?.defaultPath || 'claw-code-export.json',
      filters: payload?.filters || [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { ok: false, canceled: true }
    }

    await writeFile(result.filePath, String(payload?.content || ''), 'utf8')
    return { ok: true, filePath: result.filePath }
  })

  ipcMain.handle('claw:desktop:restart-launcher', async () => {
    await restartLauncher('Manual restart requested from the desktop app.')
    return { ok: true, url: uiUrl }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', async () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
      return
    }
    await createMainWindow()
  })

  app.whenReady().then(async () => {
    registerIpc()
    await createMainWindow()

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow()
      }
    })
  })

  app.on('before-quit', async () => {
    appIsQuitting = true
    stopLauncherHealthMonitor()
    await stopLauncher()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
