import type { EscPosCommand } from './escpos/commands'
import type { PrinterState } from './escpos/printer'

export interface CommandEntry {
  id: number
  timestamp: number
  command: EscPosCommand
  rawData: Uint8Array
}

export interface StatusSummary {
  paperWidth: string
  currentFont: string
  justification: string
  emphasis: boolean
  underline: boolean
  italic: boolean
  bufferLines: number
  commandCount: number
  dpi: number
}

export const DEFAULT_BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const

export interface EmulatorSnapshot {
  printer: PrinterState
  history: CommandEntry[]
  status: StatusSummary
  serverRunning: boolean
  serverPort: number
  serverAddress: string
}

export const IPC_CHANNELS = {
  stateUpdated: 'emulator:state-updated',
  getSnapshot: 'emulator:get-snapshot',
  clearBuffer: 'emulator:clear-buffer',
  clearHistory: 'emulator:clear-history',
  setPaperWidth: 'emulator:set-paper-width',
  setLineHeight: 'emulator:set-line-height',
  setFontSize: 'emulator:set-font-size',
  getSerialPorts: 'serial:get-ports',
  startSerial: 'serial:start',
  stopSerial: 'serial:stop',
  serialStatus: 'serial:status-changed',
  installPrinterWindows: 'printer:install-windows',
  installPrinterLinux: 'printer:install-linux',
  uninstallPrinter: 'printer:uninstall',
  checkPrinter: 'printer:check',
  testConnection: 'printer:test-connection',
  printerResult: 'printer:result',
  log: 'app:log'
} as const
