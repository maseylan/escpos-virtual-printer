import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import net from 'node:net'
import { startServer, testConnection } from '../src/main/networking/server'
import { EmulatorState } from '../src/main/emulator/emulator-state'

describe('ESC/POS TCP server', () => {
  const state = new EmulatorState()
  let port = 9100
  let stop: () => Promise<void>

  beforeAll(async () => {
    const handle = await startServer(state, port)
    port = handle.port
    stop = handle.stop
  })

  afterAll(async () => {
    await stop()
  })

  it('starts and reports running status', () => {
    expect(state.serverRunning).toBe(true)
    expect(state.serverPort).toBe(port)
  })

  it('parses a raw ESC/POS stream and updates printer state', async () => {
    const payload = Buffer.concat([
      Buffer.from([0x1b, 0x40]), // ESC @
      Buffer.from('Hello World'),
      Buffer.from([0x0a]), // LF
      Buffer.from([0x1b, 0x61, 0x01]), // ESC a 1 (center)
      Buffer.from([0x1b, 0x45, 0x01]), // ESC E 1 (bold)
      Buffer.from('CENTRAL'),
      Buffer.from([0x1b, 0x6d]) // ESC m (cut)
    ])

    await sendRaw(payload)

    const snapshot = state.snapshot()
    const lines = snapshot.printer.buffer
    expect(lines.length).toBeGreaterThanOrEqual(3)
    const textLines = lines.filter((l) => l.kind === 'Text')
    expect(textLines.some((l) => l.kind === 'Text' && l.line.text === 'Hello World')).toBe(true)
    expect(textLines.some((l) => l.kind === 'Text' && l.line.text === 'CENTRAL' && l.line.emphasis && l.line.justification === 'Center')).toBe(true)
    expect(snapshot.printer.buffer.some((l) => l.kind === 'Separator')).toBe(true)
    expect(snapshot.status.commandCount).toBeGreaterThanOrEqual(7)
  })

  it('handles data split across multiple TCP chunks', async () => {
    const bytes = [0x1b, 0x40, ...Buffer.from('A'), 0x1b, 0x45, 0x01, ...Buffer.from('B')]
    const socket = net.connect({ host: '127.0.0.1', port })
    // Note: a 'data' listener is required to resume the socket stream —
    // without it the socket stays in paused mode and 'end' never fires.
    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.write(Buffer.from([bytes[0]!]))
        setTimeout(() => socket.write(Buffer.from(bytes.slice(1, 3))), 20)
        setTimeout(() => {
          socket.write(Buffer.from(bytes.slice(3)))
          socket.end()
        }, 40)
      })
      socket.on('data', () => {
        // consume the OK response so 'end' can fire
      })
      socket.on('end', () => resolve())
      socket.on('error', () => resolve())
    })
    const snapshot = state.snapshot()
    const textLines = snapshot.printer.buffer.filter((l) => l.kind === 'Text')
    // ESC @ resets state; 'A' (plain) and 'B' (emphasis) differ in style → separate lines
    expect(textLines.some((l) => l.kind === 'Text' && l.line.text === 'A' && !l.line.emphasis)).toBe(true)
    expect(textLines.some((l) => l.kind === 'Text' && l.line.text === 'B' && l.line.emphasis)).toBe(true)
    const entry = snapshot.history.find((h) => h.command.type === 'SetEmphasis')
    expect(entry?.command.type === 'SetEmphasis' && entry.command.enabled).toBe(true)
  })

  it('responds OK on connection end', async () => {
    const response = await sendRaw(Buffer.from('ping'))
    expect(response.toString()).toBe('OK\n')
  })

  it('responds to HTTP OPTIONS preflight with CORS headers', async () => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const response = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      socket.on('connect', () => {
        socket.write('OPTIONS / HTTP/1.1\r\nHost: localhost\r\n\r\n')
      })
      socket.on('data', (d: Buffer) => {
        chunks.push(d)
        socket.end()
      })
      socket.on('end', () => resolve(Buffer.concat(chunks)))
      socket.on('error', reject)
    })
    const text = response.toString()
    expect(text).toContain('204 No Content')
    expect(text.toLowerCase()).toContain('access-control-allow-origin: *')
    expect(text.toLowerCase()).toContain('access-control-allow-private-network: true')
  })

  it('processes HTTP POST body as ESC/POS data', async () => {
    const body = Buffer.concat([
      Buffer.from([0x1b, 0x40]),
      Buffer.from('HTTP RECEIPT')
    ])
    const response = await postHttp(body)
    expect(response.status).toBe(200)
    const snapshot = state.snapshot()
    const found = snapshot.printer.buffer.find(
      (l) => l.kind === 'Text' && l.line.text === 'HTTP RECEIPT'
    )
    expect(found).toBeDefined()
  })

  it('testConnection succeeds against the running server', async () => {
    const result = await testConnection(port)
    expect(result).toContain('✅')
  })
})

function sendRaw(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 9100 })
    const chunks: Buffer[] = []
    socket.on('connect', () => socket.end(data))
    socket.on('data', (d: Buffer) => chunks.push(d))
    socket.on('end', () => resolve(Buffer.concat(chunks)))
    socket.on('error', reject)
  })
}

function postHttp(body: Buffer): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: 9100 })
    const chunks: Buffer[] = []
    socket.on('connect', () => {
      const head = `POST /print HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/octet-stream\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`
      socket.write(Buffer.concat([Buffer.from(head), body]))
    })
    socket.on('data', (d: Buffer) => chunks.push(d))
    socket.on('end', () => {
      const full = Buffer.concat(chunks).toString('latin1')
      const statusMatch = /^HTTP\/1\.1 (\d+)/.exec(full)
      resolve({ status: parseInt(statusMatch?.[1] ?? '0', 10), body: full })
    })
    socket.on('error', reject)
  })
}
