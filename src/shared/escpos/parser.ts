import type { EscPosCommand } from './commands'

/**
 * Streaming ESC/POS parser.
 *
 * Maintains an internal byte buffer: incomplete sequences at the end of a chunk
 * wait for the next chunk. Unknown sequences are skipped without crashing.
 */
export class EscPosParser {
  private buffer: Uint8Array = new Uint8Array(0)

  parseStream(data: Uint8Array): EscPosCommand[] {
    this.buffer = concat(this.buffer, data)
    const commands: EscPosCommand[] = []
    let i = 0

    while (i < this.buffer.length) {
      const b = this.buffer[i]

      if (b === 0x0a) {
        commands.push({ type: 'NewLine' })
        i += 1
        continue
      }
      if (b === 0x0d) {
        commands.push({ type: 'CarriageReturn' })
        i += 1
        continue
      }
      if (b === 0x1b) {
        const result = this.parseEsc(this.buffer, i)
        if (result === null) break // incomplete — wait for more data
        if (result !== undefined) commands.push(result.cmd)
        i += result === undefined ? 2 : result.consumed
        continue
      }
      if (b === 0x1d) {
        const result = this.parseGs(this.buffer, i)
        if (result === null) break
        if (result !== undefined) commands.push(result.cmd)
        i += result === undefined ? 2 : result.consumed
        continue
      }

      // Plain text run
      const start = i
      while (
        i < this.buffer.length &&
        this.buffer[i] !== 0x1b &&
        this.buffer[i] !== 0x1d &&
        this.buffer[i] !== 0x0a &&
        this.buffer[i] !== 0x0d
      ) {
        i += 1
      }
      if (i > start) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(this.buffer.slice(start, i))
        if (text.length > 0) commands.push({ type: 'Text', text })
      }
    }

    if (i > 0) {
      this.buffer = this.buffer.slice(i)
    }

    return commands
  }

  get pendingBytes(): number {
    return this.buffer.length
  }

  /**
   * Parse ESC (0x1B) sequences. Returns undefined when the sequence is invalid
   * (skipped), null when incomplete (wait for more data).
   */
  private parseEsc(
    buf: Uint8Array,
    i: number
  ): { cmd: EscPosCommand; consumed: number } | null | undefined {
    if (i + 1 >= buf.length) return null
    const op = buf[i + 1]
    const need = (n: number): number | null => (i + n >= buf.length ? null : i + n)
    const n = (offset: number): number | null => need(offset)

    switch (op) {
      case 0x40: // ESC @ — initialize
        return { cmd: { type: 'InitializePrinter' }, consumed: 2 }

      case 0x4d: {
        // ESC M n — select font
        const p = n(2)
        if (p === null) return null
        const font = buf[p] === 1 ? 'B' : buf[p] === 2 ? 'C' : 'A'
        return { cmd: { type: 'SetFont', font }, consumed: 3 }
      }

      case 0x61: {
        // ESC a n — justification
        const p = n(2)
        if (p === null) return null
        const j = buf[p] === 1 ? 'Center' : buf[p] === 2 ? 'Right' : 'Left'
        return { cmd: { type: 'SetJustification', justification: j }, consumed: 3 }
      }

      case 0x45: {
        // ESC E n — emphasis on
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetEmphasis', enabled: buf[p] !== 0 }, consumed: 3 }
      }

      case 0x46: {
        // ESC F n — emphasis off
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetEmphasis', enabled: buf[p] === 0 }, consumed: 3 }
      }

      case 0x2d: {
        // ESC - n — underline
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetUnderline', enabled: buf[p] !== 0 }, consumed: 3 }
      }

      case 0x34: {
        // ESC 4 n — italic on
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetItalic', enabled: buf[p] !== 0 }, consumed: 3 }
      }

      case 0x35: {
        // ESC 5 n — italic off
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetItalic', enabled: buf[p] === 0 }, consumed: 3 }
      }

      case 0x33: {
        // ESC 3 n — line height
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetLineHeight', height: buf[p] ?? 0 }, consumed: 3 }
      }

      case 0x21: {
        // ESC ! n — font size / print mode
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetFontSize', size: buf[p] ?? 0 }, consumed: 3 }
      }

      case 0x74: {
        // ESC t n — codepage
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'SetCodepage', codepage: buf[p] ?? 0 }, consumed: 3 }
      }

      case 0x6d:
      case 0x69:
        // ESC m / ESC i — cut paper
        return { cmd: { type: 'CutPaper' }, consumed: 2 }

      case 0x4a: {
        // ESC J n — feed
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'LineFeed' }, consumed: 3 }
      }

      case 0x64: {
        // ESC d n — feed
        const p = n(2)
        if (p === null) return null
        return { cmd: { type: 'LineFeed' }, consumed: 3 }
      }

      case 0x2a: {
        // ESC * m nL nH data — bit image
        const m = buf[i + 2]
        if (m === undefined) return null
        const p = n(3)
        if (p === null) return null
        const nl = buf[p]
        const nh = buf[p + 1]
        if (nl === undefined || nh === undefined) return null
        const nDots = nl + nh * 256
        const bytesPerCol = m === 0 || m === 1 ? 1 : m === 32 || m === 33 ? 3 : 1
        const total = bytesPerCol * nDots
        const dataEnd = 5 + total
        if (i + dataEnd > buf.length) return null
        return {
          cmd: { type: 'PrintImage', data: buf.slice(i + 5, i + dataEnd) },
          consumed: dataEnd
        }
      }

      default:
        // Unknown ESC sequence — emit Unknown and skip 2 bytes
        return { cmd: { type: 'Unknown', data: buf.slice(i, i + 2) }, consumed: 2 }
    }
  }

  /**
   * Parse GS (0x1D) sequences.
   */
  private parseGs(
    buf: Uint8Array,
    i: number
  ): { cmd: EscPosCommand; consumed: number } | null | undefined {
    if (i + 1 >= buf.length) return null
    const op = buf[i + 1]

    switch (op) {
      case 0x76: {
        // GS v 0 m xL xH yL yH d1...dk — raster bit image
        if (i + 7 >= buf.length) return null
        const xL = buf[i + 4]
        const xH = buf[i + 5]
        const yL = buf[i + 6]
        const yH = buf[i + 7]
        if (xL === undefined || xH === undefined || yL === undefined || yH === undefined) return null
        const widthBytes = xL + xH * 256
        const height = yL + yH * 256
        const total = widthBytes * height
        const dataEnd = 8 + total
        if (i + dataEnd > buf.length) return null
        return {
          cmd: {
            type: 'PrintRasterImage',
            widthBytes,
            height,
            data: buf.slice(i + 8, i + dataEnd)
          },
          consumed: dataEnd
        }
      }

      case 0x56: {
        // GS V n — cut paper (variants)
        const p = n(2)
        if (p === null) return null
        const v = buf[p]
        if (v === 65 || v === 66) {
          if (i + 3 >= buf.length) return null
          return { cmd: { type: 'CutPaper' }, consumed: 4 }
        }
        return { cmd: { type: 'CutPaper' }, consumed: 3 }
      }

      default:
        return { cmd: { type: 'Unknown', data: buf.slice(i, i + 2) }, consumed: 2 }
    }

    function n(offset: number): number | null {
      return i + offset >= buf.length ? null : i + offset
    }
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b.slice()
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
