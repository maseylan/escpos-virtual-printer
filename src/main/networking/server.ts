import net from 'node:net'
import { EscPosParser } from '../../shared/escpos/parser'
import type { EmulatorState } from '../emulator/emulator-state'
import { log } from '../util/log'

const CORS_HEADERS = [
  'Access-Control-Allow-Origin: *',
  'Access-Control-Allow-Methods: POST, GET, OPTIONS',
  'Access-Control-Allow-Headers: *',
  'Access-Control-Allow-Private-Network: true',
  'Access-Control-Max-Age: 86400'
].join('\r\n')

export interface ServerHandle {
  port: number
  stop: () => Promise<void>
}

/**
 * Raw ESC/POS TCP server on 127.0.0.1:9100 with Web HTTP POST + CORS support.
 * Mirrors the reference implementation: per-connection handling, HTTP detected
 * by inspecting the first chunk (OPTIONS preflight / POST), everything else is
 * treated as a raw ESC/POS byte stream.
 */
export async function startServer(state: EmulatorState, port = 9100): Promise<ServerHandle> {
  const server = net.createServer((socket) => {
    handleConnection(socket, state).catch((err) => {
      log.error(`Connection error: ${String(err)}`)
      socket.destroy()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  state.setServerStatus(true, port, '127.0.0.1')
  log.info(`ESC/POS Emulator server listening on 127.0.0.1:${port} (Raw TCP & Web HTTP/CORS)`)

  return {
    port,
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      state.setServerStatus(false, port, '127.0.0.1')
      log.info('Server stopped')
    }
  }
}

async function handleConnection(socket: net.Socket, state: EmulatorState): Promise<void> {
  const addr = socket.remoteAddress ?? 'unknown'
  log.info(`New connection from: ${addr}`)

  const buffer: Buffer[] = []
  let parser: EscPosParser | null = null
  let firstChunk = true
  let mode: 'raw' | 'http-options' | 'http-headers' | 'http-body' | 'http-done' = 'raw'
  let contentLength = 0
  let responded = false

  const respondHttp = (statusLine: string, extraHeaders: string[], body = ''): void => {
    if (responded) return
    responded = true
    const headers = extraHeaders.length > 0 ? `\r\n${extraHeaders.join('\r\n')}` : ''
    socket.write(
      `${statusLine}${headers}\r\nConnection: close\r\n\r\n${body}`
    )
  }

  socket.on('data', (chunk: Buffer) => {
    try {
      if (mode === 'raw') {
        // Detect HTTP request on the very first chunk only
        if (firstChunk && (chunk[0] === 0x4f || chunk[0] === 0x50)) {
          const head = chunk.subarray(0, Math.min(chunk.length, 64)).toString('latin1')
          if (head.startsWith('OPTIONS ')) {
            mode = 'http-options'
            // Preflight requests arrive in a single chunk — respond immediately
            respondHttp('HTTP/1.1 204 No Content', CORS_HEADERS.split('\r\n'))
            socket.end()
            return
          }
          if (head.startsWith('POST ')) {
            mode = 'http-headers'
            buffer.push(chunk)
            const parsed = tryParseHttpHeaders(Buffer.concat(buffer))
            if (parsed) {
              contentLength = parsed.contentLength
              const bodyStart = parsed.bodyStart
              const body = chunk.subarray(bodyStart)
              if (contentLength <= body.length) {
                processBody(body.subarray(0, contentLength), state)
                respondHttp('HTTP/1.1 200 OK', [
                  ...CORS_HEADERS.split('\r\n'),
                  'Content-Type: text/plain'
                ], 'OK')
                socket.end()
                return
              }
              mode = 'http-body'
            }
            return
          }
        }
        // Raw ESC/POS stream
        firstChunk = false
        parser ??= new EscPosParser()
        const commands = parser.parseStream(chunk)
        for (const cmd of commands) {
          log.info(`Received command: ${cmd.type}`)
          state.processCommand(cmd, chunk)
        }
        return
      }

      if (mode === 'http-done') {
        return
      }

      if (mode === 'http-headers' || mode === 'http-body') {
        buffer.push(chunk)
        const parsed = tryParseHttpHeaders(Buffer.concat(buffer))
        if (!parsed) return
        if (mode === 'http-headers') {
          contentLength = parsed.contentLength
          mode = 'http-body'
        }
        const remaining = contentLength - (Buffer.concat(buffer).length - parsed.bodyStart)
        if (remaining <= 0) {
          const body = Buffer.concat(buffer).subarray(parsed.bodyStart, parsed.bodyStart + contentLength)
          processBody(body, state)
          respondHttp('HTTP/1.1 200 OK', [
            ...CORS_HEADERS.split('\r\n'),
            'Content-Type: text/plain'
          ], 'OK')
          socket.end()
        }
        return
      }
    } catch (err) {
      log.error(`Handler error: ${String(err)}`)
      socket.destroy()
    }
  })

  socket.on('error', (err) => {
    log.warn(`Socket error from ${addr}: ${err.message}`)
  })

  socket.on('end', () => {
    if (!responded) {
      try {
        socket.write(Buffer.from('OK\n'))
      } catch {
        // socket may already be destroyed
      }
    }
    socket.end()
  })
}

function tryParseHttpHeaders(data: Buffer): { contentLength: number; bodyStart: number } | null {
  const sep = data.indexOf(Buffer.from('\r\n\r\n'))
  if (sep === -1) return null
  const headerText = data.subarray(0, sep).toString('latin1')
  const match = /content-length:\s*(\d+)/i.exec(headerText)
  const contentLength = match ? parseInt(match[1] ?? '0', 10) : 0
  return { contentLength, bodyStart: sep + 4 }
}

function processBody(body: Buffer, state: EmulatorState): void {
  const parser = new EscPosParser()
  const commands = parser.parseStream(body)
  for (const cmd of commands) {
    log.info(`Received HTTP command: ${cmd.type}`)
    state.processCommand(cmd, body)
  }
}

export async function testConnection(port = 9100, host = '127.0.0.1'): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    socket.setTimeout(2000)
    socket.on('connect', () => {
      socket.destroy()
      resolve(`✅ Connection to TCP port ${port} successful (Emulator is listening)`)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(`❌ Connection to TCP port ${port} timed out`)
    })
    socket.on('error', (err) => {
      resolve(`❌ Connection to TCP port ${port} failed: ${err.message}`)
    })
  })
}
