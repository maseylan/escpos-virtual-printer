import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { EmulatorState } from './emulator/emulator-state'
import { startServer } from './networking/server'
import { registerIpcHandlers, type SerialController } from './ipc'
import { log } from './util/log'

const emulatorState = new EmulatorState()
const serialController: SerialController = { handle: null }
let serverHandle: { stop: () => Promise<void> } | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ESC/POS Virtual Printer Emulator',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  registerIpcHandlers(emulatorState, serialController)

  try {
    serverHandle = await startServer(emulatorState, 9100)
  } catch (err) {
    log.error(`Failed to start TCP server: ${String(err)}`)
  }
}

app.whenReady().then(async () => {
  log.info('🚀 Starting ESC/POS Emulator...')
  await bootstrap()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  serialController.handle?.stop()
  void serverHandle?.stop()
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (err) => {
  log.error(`Uncaught exception: ${String(err)}`)
})

process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection: ${String(reason)}`)
})
