import pino from 'pino'

const inElectron = typeof process !== 'undefined' && Boolean(process.versions?.electron)

let electronLog: typeof import('electron-log') | null = null
if (inElectron) {
  try {
    electronLog = require('electron-log')
  } catch {
    electronLog = null
  }
}

const fileLogger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
})

const write = (level: 'info' | 'warn' | 'error' | 'debug', msg: string): void => {
  fileLogger[level](msg)
  if (electronLog) {
    electronLog[level](msg)
  } else if (level !== 'debug') {
    const prefix = level.toUpperCase()
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${prefix}] ${msg}`)
  }
}

export const log = {
  info: (msg: string): void => write('info', msg),
  warn: (msg: string): void => write('warn', msg),
  error: (msg: string): void => write('error', msg),
  debug: (msg: string): void => write('debug', msg)
}
