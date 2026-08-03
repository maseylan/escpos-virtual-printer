import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { EmulatorSnapshot } from '../shared/types'

export interface PrinterResult {
  ok: boolean
  message: string
}

const api = {
  platform: process.platform,

  getSnapshot: (): Promise<EmulatorSnapshot> => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),

  onStateUpdated: (callback: (snapshot: EmulatorSnapshot) => void): (() => void) => {
    const listener = (_e: unknown, snapshot: EmulatorSnapshot): void => callback(snapshot)
    ipcRenderer.on(IPC_CHANNELS.stateUpdated, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.stateUpdated, listener)
  },

  clearBuffer: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.clearBuffer),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.clearHistory),
  setPaperWidth: (mm: number): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setPaperWidth, mm),
  setLineHeight: (height: number): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setLineHeight, height),
  setFontSize: (size: number): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.setFontSize, size),

  getSerialPorts: (): Promise<string[]> => ipcRenderer.invoke(IPC_CHANNELS.getSerialPorts),
  startSerial: (portName: string, baudRate: number): Promise<PrinterResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.startSerial, portName, baudRate),
  stopSerial: (): Promise<PrinterResult> => ipcRenderer.invoke(IPC_CHANNELS.stopSerial),

  installPrinterWindows: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.installPrinterWindows),
  installPrinterLinux: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.installPrinterLinux),
  uninstallPrinter: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.uninstallPrinter),
  checkPrinter: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.checkPrinter),
  testConnection: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.testConnection)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
