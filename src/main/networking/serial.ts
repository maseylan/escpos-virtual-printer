import { SerialPort } from 'serialport'
import { EscPosParser } from '../../shared/escpos/parser'
import type { EmulatorState } from '../emulator/emulator-state'
import { DEFAULT_BAUD_RATES } from '../../shared/types'
import { log } from '../util/log'

export interface SerialHandle {
  portName: string
  baudRate: number
  stop: () => void
  isRunning: () => boolean
}

export async function listComPorts(): Promise<string[]> {
  try {
    const ports = await SerialPort.list()
    return ports.map((p) => p.path)
  } catch (err) {
    log.warn(`Failed to list serial ports: ${String(err)}`)
    return []
  }
}

export async function startSerialListener(
  portName: string,
  baudRate: number,
  state: EmulatorState
): Promise<SerialHandle> {
  const port = new SerialPort(
    { path: portName, baudRate, autoOpen: false },
    (err) => {
      if (err) {
        log.error(`Failed to open serial port ${portName}: ${err.message}`)
      }
    }
  )

  await new Promise<void>((resolve, reject) => {
    port.once('open', () => {
      port.removeListener('error', reject)
      resolve()
    })
    port.once('error', reject)
  })

  const parser = new EscPosParser()

  port.on('data', (chunk: Buffer) => {
    const commands = parser.parseStream(chunk)
    for (const cmd of commands) {
      log.info(`Serial command: ${cmd.type}`)
      state.processCommand(cmd, chunk)
    }
  })

  let running = true
  const handle: SerialHandle = {
    portName,
    baudRate,
    stop: () => {
      if (!running) return
      running = false
      port.removeAllListeners('data')
      port.close((err) => {
        if (err) log.warn(`Error closing serial port ${portName}: ${err.message}`)
      })
      log.info(`Serial listener stopped on ${portName}`)
    },
    isRunning: () => running
  }

  log.info(`Serial listener started on ${portName} @ ${baudRate} baud`)
  return handle
}
