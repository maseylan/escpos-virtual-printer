import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, DEFAULT_BAUD_RATES } from '../shared/types'
import type { EmulatorState } from './emulator/emulator-state'
import type { SerialHandle } from './networking/serial'
import { listComPorts, startSerialListener } from './networking/serial'
import { testConnection } from './networking/server'
import {
  checkCupsPrinter,
  checkWindowsPrinter,
  installCupsPrinter,
  installWindowsPrinter,
  uninstallCupsPrinter,
  uninstallWindowsPrinter
} from './printer/install'
import { log } from './util/log'

export interface SerialController {
  handle: SerialHandle | null
}

export function registerIpcHandlers(
  state: EmulatorState,
  serialController: SerialController
): void {
  ipcMain.handle(IPC_CHANNELS.getSnapshot, () => state.snapshot())

  ipcMain.handle(IPC_CHANNELS.clearBuffer, () => {
    state.clearPrinterBuffer()
  })

  ipcMain.handle(IPC_CHANNELS.clearHistory, () => {
    state.clearHistory()
  })

  ipcMain.handle(IPC_CHANNELS.setPaperWidth, (_e, mm: number) => {
    if (typeof mm === 'number') state.setPaperWidth(mm)
  })

  ipcMain.handle(IPC_CHANNELS.setLineHeight, (_e, height: number) => {
    if (typeof height === 'number') state.setLineHeight(height)
  })

  ipcMain.handle(IPC_CHANNELS.setFontSize, (_e, size: number) => {
    if (typeof size === 'number') state.setFontSize(size)
  })

  ipcMain.handle(IPC_CHANNELS.getSerialPorts, async () => listComPorts())

  ipcMain.handle(
    IPC_CHANNELS.startSerial,
    async (_e, portName: string, baudRate: number) => {
      if (serialController.handle?.isRunning()) {
        return { ok: false, message: 'Serial listener already running' }
      }
      if (!portName || !DEFAULT_BAUD_RATES.includes(baudRate as (typeof DEFAULT_BAUD_RATES)[number])) {
        return { ok: false, message: 'Invalid port or baud rate' }
      }
      try {
        serialController.handle = await startSerialListener(portName, baudRate, state)
        return { ok: true, message: `Listening on ${portName} @ ${baudRate} baud` }
      } catch (err) {
        return { ok: false, message: `Error: ${String(err)}` }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.stopSerial, () => {
    if (serialController.handle) {
      serialController.handle.stop()
      serialController.handle = null
      return { ok: true, message: 'Serial listener stopped.' }
    }
    return { ok: false, message: 'Serial listener is not running' }
  })

  ipcMain.handle(IPC_CHANNELS.installPrinterWindows, async () => installWindowsPrinter())
  ipcMain.handle(IPC_CHANNELS.installPrinterLinux, async () => installCupsPrinter())
  ipcMain.handle(IPC_CHANNELS.uninstallPrinter, async () => {
    if (process.platform === 'win32') return uninstallWindowsPrinter()
    return uninstallCupsPrinter()
  })
  ipcMain.handle(IPC_CHANNELS.checkPrinter, async () => {
    if (process.platform === 'win32') return checkWindowsPrinter()
    return checkCupsPrinter()
  })
  ipcMain.handle(IPC_CHANNELS.testConnection, async () => testConnection())

  state.on('state-updated', (snapshot: ReturnType<EmulatorState['snapshot']>) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.stateUpdated, snapshot)
      }
    }
  })

  log.info('IPC handlers registered')
}
