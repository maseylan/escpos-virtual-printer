import { describe, expect, it } from 'vitest'
import {
  createDefaultPrinterState,
  processCommand,
  getMaxChars,
  getWidthDots,
  paperWidthFromMm,
  calculateTotalHeight
} from '../src/shared/escpos/printer'
import type { PrinterState } from '../src/shared/escpos/printer'

function withCommand(state: PrinterState, type: 'Text' | 'SetEmphasis' | 'SetJustification' | 'SetFont' | 'CutPaper', value?: unknown): void {
  switch (type) {
    case 'Text':
      processCommand(state, { type: 'Text', text: String(value) })
      break
    case 'SetEmphasis':
      processCommand(state, { type: 'SetEmphasis', enabled: Boolean(value) })
      break
    case 'SetJustification':
      processCommand(state, { type: 'SetJustification', justification: value as never })
      break
    case 'SetFont':
      processCommand(state, { type: 'SetFont', font: value as never })
      break
    case 'CutPaper':
      processCommand(state, { type: 'CutPaper' })
      break
  }
}

describe('PrinterState', () => {
  it('defaults to 80mm paper, Font A, left-aligned', () => {
    const s = createDefaultPrinterState()
    expect(s.paperWidth).toBe('Width80mm')
    expect(s.currentFont).toBe('A')
    expect(s.justification).toBe('Left')
    expect(s.lineHeight).toBe(24)
    expect(s.fontSize).toBe(12)
  })

  it('maps mm to PaperWidth', () => {
    expect(paperWidthFromMm(50)).toBe('Width50mm')
    expect(paperWidthFromMm(78)).toBe('Width78mm')
    expect(paperWidthFromMm(80)).toBe('Width80mm')
    expect(paperWidthFromMm(999)).toBe('Width80mm')
  })

  it('returns correct dot widths', () => {
    expect(getWidthDots('Width50mm')).toBe(384)
    expect(getWidthDots('Width78mm')).toBe(576)
    expect(getWidthDots('Width80mm')).toBe(640)
  })

  it('computes max chars per font size', () => {
    expect(getMaxChars('Width80mm', 12)).toBe(80)
    expect(getMaxChars('Width80mm', 16)).toBe(64)
    expect(getMaxChars('Width80mm', 24)).toBe(53)
    expect(getMaxChars('Width50mm', 12)).toBe(48)
  })

  it('appends text to a same-style line', () => {
    const s = createDefaultPrinterState()
    withCommand(s, 'Text', 'Hello')
    withCommand(s, 'Text', ' World')
    expect(s.buffer).toHaveLength(1)
    expect(s.buffer[0]).toEqual({ kind: 'Text', line: expect.objectContaining({ text: 'Hello World' }) })
  })

  it('splits text into a new line when the style changes', () => {
    const s = createDefaultPrinterState()
    withCommand(s, 'Text', 'plain')
    withCommand(s, 'SetEmphasis', true)
    withCommand(s, 'Text', 'bold')
    expect(s.buffer).toHaveLength(2)
    expect(s.buffer[1]).toEqual({ kind: 'Text', line: expect.objectContaining({ text: 'bold', emphasis: true }) })
  })

  it('auto-wraps text exceeding max chars when appending', () => {
    const s = createDefaultPrinterState()
    s.paperWidth = 'Width50mm'
    // 40 chars fits within 48
    withCommand(s, 'Text', 'a'.repeat(40))
    // appending another 10 chars overflows → new line holding the full text (reference behavior)
    withCommand(s, 'Text', 'b'.repeat(10))
    expect(s.buffer.length).toBe(2)
    const lines = s.buffer.filter((l) => l.kind === 'Text') as { line: { text: string } }[]
    expect(lines[0]?.line.text).toBe('a'.repeat(40))
    expect(lines[1]?.line.text).toBe('b'.repeat(10))
  })

  it('newline pushes an empty text line', () => {
    const s = createDefaultPrinterState()
    processCommand(s, { type: 'NewLine' })
    expect(s.buffer).toHaveLength(1)
    expect(s.buffer[0]).toEqual({ kind: 'Text', line: expect.objectContaining({ text: '' }) })
  })

  it('cut paper adds a separator', () => {
    const s = createDefaultPrinterState()
    withCommand(s, 'CutPaper')
    expect(s.buffer).toHaveLength(1)
    expect(s.buffer[0]).toEqual({ kind: 'Separator' })
  })

  it('raster image is added as a Bitmap line with px width', () => {
    const s = createDefaultPrinterState()
    const data = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])
    processCommand(s, { type: 'PrintRasterImage', widthBytes: 4, height: 2, data })
    expect(s.buffer[0]).toEqual({
      kind: 'Bitmap',
      widthPx: 32,
      heightPx: 2,
      data
    })
  })

  it('initialize printer resets state but keeps paper width', () => {
    const s = createDefaultPrinterState()
    s.paperWidth = 'Width50mm'
    withCommand(s, 'SetEmphasis', true)
    withCommand(s, 'Text', 'x')
    processCommand(s, { type: 'InitializePrinter' })
    expect(s.paperWidth).toBe('Width50mm')
    expect(s.emphasis).toBe(false)
    expect(s.currentFont).toBe('A')
    expect(s.buffer).toEqual([])
  })

  it('calculates total height', () => {
    const s = createDefaultPrinterState()
    withCommand(s, 'Text', 'a')
    withCommand(s, 'CutPaper')
    expect(calculateTotalHeight(s)).toBe(48)
  })
})
