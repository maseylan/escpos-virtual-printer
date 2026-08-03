import { EventEmitter } from 'node:events'
import {
  clearBuffer as clearPrinterBuffer,
  createDefaultPrinterState,
  processCommand,
  paperWidthFromMm,
  type PrinterState
} from '../../shared/escpos/printer'
import type { EscPosCommand } from '../../shared/escpos/commands'
import type { CommandEntry, StatusSummary } from '../../shared/types'

export const DEFAULT_MAX_HISTORY = 1000

export class EmulatorState extends EventEmitter {
  printer: PrinterState
  history: CommandEntry[] = []
  maxHistorySize: number
  startTime: number
  serverRunning = false
  serverPort = 9100
  serverAddress = '127.0.0.1'

  private nextEntryId = 1

  constructor(maxHistorySize = DEFAULT_MAX_HISTORY) {
    super()
    this.printer = createDefaultPrinterState()
    this.maxHistorySize = maxHistorySize
    this.startTime = Date.now()
  }

  processCommand(command: EscPosCommand, rawData?: Uint8Array): void {
    const entry: CommandEntry = {
      id: this.nextEntryId++,
      timestamp: Date.now(),
      command: command,
      rawData: rawData ?? new Uint8Array(0)
    }

    this.history.push(entry)
    while (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }

    processCommand(this.printer, command)
    this.emit('state-updated', this.snapshot())
  }

  clearHistory(): void {
    this.history = []
    this.emit('state-updated', this.snapshot())
  }

  clearPrinterBuffer(): void {
    clearPrinterBuffer(this.printer)
    this.emit('state-updated', this.snapshot())
  }

  setPaperWidth(mm: number): void {
    this.printer.paperWidth = paperWidthFromMm(mm)
    this.emit('state-updated', this.snapshot())
  }

  setLineHeight(height: number): void {
    this.printer.lineHeight = height
    this.emit('state-updated', this.snapshot())
  }

  setFontSize(size: number): void {
    this.printer.fontSize = size
    this.emit('state-updated', this.snapshot())
  }

  setServerStatus(running: boolean, port = 9100, address = '127.0.0.1'): void {
    this.serverRunning = running
    this.serverPort = port
    this.serverAddress = address
    this.emit('state-updated', this.snapshot())
  }

  getStatusSummary(): StatusSummary {
    return {
      paperWidth: this.printer.paperWidth,
      currentFont: this.printer.currentFont,
      justification: this.printer.justification,
      emphasis: this.printer.emphasis,
      underline: this.printer.underline,
      italic: this.printer.italic,
      bufferLines: this.printer.buffer.length,
      commandCount: this.history.length,
      dpi: this.printer.dpi
    }
  }

  snapshot(): import('../../shared/types').EmulatorSnapshot {
    return {
      printer: structuredClone(this.printer),
      history: this.history.map((h) => ({ ...h, rawData: h.rawData.slice() })),
      status: this.getStatusSummary(),
      serverRunning: this.serverRunning,
      serverPort: this.serverPort,
      serverAddress: this.serverAddress
    }
  }
}
