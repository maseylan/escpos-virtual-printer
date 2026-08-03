import { describe, expect, it } from 'vitest'
import { EscPosParser } from '../src/shared/escpos/parser'
import type { EscPosCommand } from '../src/shared/escpos/commands'

function parseBytes(bytes: number[]): EscPosCommand[] {
  return new EscPosParser().parseStream(new Uint8Array(bytes))
}

function hex(s: string): number[] {
  return s
    .trim()
    .split(/\s+/)
    .map((b) => parseInt(b, 16))
}

describe('EscPosParser', () => {
  it('parses plain text and newlines', () => {
    const commands = parseBytes([...Buffer.from('Hello'), 0x0a])
    expect(commands).toEqual([{ type: 'Text', text: 'Hello' }, { type: 'NewLine' }])
  })

  it('parses ESC @ (initialize)', () => {
    expect(parseBytes(hex('1B 40'))).toEqual([{ type: 'InitializePrinter' }])
  })

  it('parses ESC M n (font)', () => {
    expect(parseBytes(hex('1B 4D 00'))).toEqual([{ type: 'SetFont', font: 'A' }])
    expect(parseBytes(hex('1B 4D 01'))).toEqual([{ type: 'SetFont', font: 'B' }])
    expect(parseBytes(hex('1B 4D 02'))).toEqual([{ type: 'SetFont', font: 'C' }])
  })

  it('parses ESC a n (justification)', () => {
    expect(parseBytes(hex('1B 61 01'))).toEqual([{ type: 'SetJustification', justification: 'Center' }])
    expect(parseBytes(hex('1B 61 02'))).toEqual([{ type: 'SetJustification', justification: 'Right' }])
    expect(parseBytes(hex('1B 61 00'))).toEqual([{ type: 'SetJustification', justification: 'Left' }])
  })

  it('parses emphasis / underline / italic toggles', () => {
    expect(parseBytes(hex('1B 45 01'))).toEqual([{ type: 'SetEmphasis', enabled: true }])
    expect(parseBytes(hex('1B 46 01'))).toEqual([{ type: 'SetEmphasis', enabled: false }])
    expect(parseBytes(hex('1B 2D 01'))).toEqual([{ type: 'SetUnderline', enabled: true }])
    expect(parseBytes(hex('1B 34 01'))).toEqual([{ type: 'SetItalic', enabled: true }])
    expect(parseBytes(hex('1B 35 01'))).toEqual([{ type: 'SetItalic', enabled: false }])
  })

  it('parses line height and font size', () => {
    expect(parseBytes(hex('1B 33 18'))).toEqual([{ type: 'SetLineHeight', height: 24 }])
    expect(parseBytes(hex('1B 21 10'))).toEqual([{ type: 'SetFontSize', size: 16 }])
  })

  it('parses codepage selection', () => {
    expect(parseBytes(hex('1B 74 02'))).toEqual([{ type: 'SetCodepage', codepage: 2 }])
  })

  it('parses cut paper (ESC m / ESC i / GS V)', () => {
    expect(parseBytes(hex('1B 6D'))).toEqual([{ type: 'CutPaper' }])
    expect(parseBytes(hex('1B 69'))).toEqual([{ type: 'CutPaper' }])
    expect(parseBytes(hex('1D 56 00'))).toEqual([{ type: 'CutPaper' }])
    expect(parseBytes(hex('1D 56 42 01'))).toEqual([{ type: 'CutPaper' }])
  })

  it('parses ESC * bit image with correct payload size', () => {
    // m=0 (1 byte/col), nL=0x02 nH=0x00 → 2 dots → 2 bytes data
    const cmd = parseBytes(hex('1B 2A 00 02 00 AA BB'))[0]
    expect(cmd).toEqual({ type: 'PrintImage', data: new Uint8Array([0xaa, 0xbb]) })
  })

  it('parses GS v 0 raster image with correct dimensions', () => {
    // xL=4 xH=0 → 4 bytes/row; yL=2 yH=0 → 2 rows; 8 bytes data
    const cmd = parseBytes(hex('1D 76 30 00 04 00 02 00 01 02 03 04 05 06 07 08'))[0]
    expect(cmd).toEqual({
      type: 'PrintRasterImage',
      widthBytes: 4,
      height: 2,
      data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    })
  })

  it('buffers incomplete sequences across chunks', () => {
    const parser = new EscPosParser()
    // ESC E split across chunks: 1B | 45 01
    const first = parser.parseStream(new Uint8Array([0x1b]))
    expect(first).toEqual([])
    const second = parser.parseStream(new Uint8Array([0x45, 0x01]))
    expect(second).toEqual([{ type: 'SetEmphasis', enabled: true }])
  })

  it('buffers incomplete raster image across chunks', () => {
    const parser = new EscPosParser()
    const bytes = hex('1D 76 30 00 01 00 01 00 FF')
    const first = parser.parseStream(new Uint8Array(bytes.slice(0, 7)))
    expect(first).toEqual([])
    const second = parser.parseStream(new Uint8Array(bytes.slice(7)))
    expect(second).toEqual([
      { type: 'PrintRasterImage', widthBytes: 1, height: 1, data: new Uint8Array([0xff]) }
    ])
  })

  it('skips unknown ESC sequences without crashing', () => {
    const commands = parseBytes(hex('1B 7F 1B 40'))
    expect(commands).toEqual([{ type: 'Unknown', data: new Uint8Array([0x1b, 0x7f]) }, { type: 'InitializePrinter' }])
  })

  it('tolerates random garbage input', () => {
    const parser = new EscPosParser()
    const random = Array.from({ length: 4096 }, () => Math.floor(Math.random() * 256))
    // Should not throw
    const commands = parser.parseStream(new Uint8Array(random))
    expect(Array.isArray(commands)).toBe(true)
  })

  it('handles CR as CarriageReturn', () => {
    expect(parseBytes(hex('0D'))).toEqual([{ type: 'CarriageReturn' }])
  })

  it('handles ESC J / ESC d as line feed', () => {
    expect(parseBytes(hex('1B 4A 0A'))).toEqual([{ type: 'LineFeed' }])
    expect(parseBytes(hex('1B 64 02'))).toEqual([{ type: 'LineFeed' }])
  })
})
