import type { Font, Justification } from './commands'

export type PaperWidth = 'Width50mm' | 'Width78mm' | 'Width80mm'

export interface TextLine {
  text: string
  font: Font
  justification: Justification
  emphasis: boolean
  underline: boolean
  italic: boolean
  fontSize: number
}

export type ReceiptLine =
  | { kind: 'Text'; line: TextLine }
  | { kind: 'Bitmap'; widthPx: number; heightPx: number; data: Uint8Array }
  | { kind: 'Separator' }

export interface PrinterState {
  paperWidth: PaperWidth
  currentFont: Font
  justification: Justification
  emphasis: boolean
  underline: boolean
  italic: boolean
  buffer: ReceiptLine[]
  lineHeight: number
  fontSize: number
  dpi: number
  codepage: number
}

export const PAPER_WIDTH_DOTS: Record<PaperWidth, number> = {
  Width50mm: 384,
  Width78mm: 576,
  Width80mm: 640
}

export const PAPER_WIDTH_META: Record<PaperWidth, { label: string; mm: number }> = {
  Width50mm: { label: '50mm', mm: 50 },
  Width78mm: { label: '78mm', mm: 78 },
  Width80mm: { label: '80mm', mm: 80 }
}

export function paperWidthFromMm(mm: number): PaperWidth {
  if (mm === 50) return 'Width50mm'
  if (mm === 78) return 'Width78mm'
  return 'Width80mm'
}

export function getWidthDots(width: PaperWidth): number {
  return PAPER_WIDTH_DOTS[width]
}

export function getMaxChars(width: PaperWidth, fontSize: number): number {
  const dots = getWidthDots(width)
  if (fontSize >= 8 && fontSize <= 12) return Math.floor(dots / 8)
  if (fontSize >= 13 && fontSize <= 16) return Math.floor(dots / 10)
  if (fontSize >= 17 && fontSize <= 24) return Math.floor(dots / 12)
  return Math.floor(dots / 8)
}

export function getPrintingWidthDots(width: PaperWidth): number {
  return Math.max(getWidthDots(width) - 30, 0)
}

export function createDefaultPrinterState(): PrinterState {
  return {
    paperWidth: 'Width80mm',
    currentFont: 'A',
    justification: 'Left',
    emphasis: false,
    underline: false,
    italic: false,
    buffer: [],
    lineHeight: 24,
    fontSize: 12,
    dpi: 180,
    codepage: 0
  }
}

export function processCommand(state: PrinterState, command: import('./commands').EscPosCommand): void {
  switch (command.type) {
    case 'Text':
      addText(state, command.text)
      break
    case 'NewLine':
    case 'CarriageReturn':
      addNewLine(state)
      break
    case 'LineFeed':
      addNewLine(state)
      break
    case 'SetFont':
      state.currentFont = command.font
      break
    case 'SetJustification':
      state.justification = command.justification
      break
    case 'SetEmphasis':
      state.emphasis = command.enabled
      break
    case 'SetUnderline':
      state.underline = command.enabled
      break
    case 'SetItalic':
      state.italic = command.enabled
      break
    case 'CutPaper':
      state.buffer.push({ kind: 'Separator' })
      break
    case 'PrintImage':
      state.buffer.push({ kind: 'Text', line: { text: '[BIT IMAGE]', font: state.currentFont, justification: state.justification, emphasis: false, underline: false, italic: false, fontSize: state.fontSize } })
      break
    case 'PrintRasterImage':
      state.buffer.push({
        kind: 'Bitmap',
        widthPx: command.widthBytes * 8,
        heightPx: command.height,
        data: command.data
      })
      break
    case 'SetCodepage':
      state.codepage = command.codepage
      break
    case 'SetLineHeight':
      state.lineHeight = command.height
      break
    case 'SetFontSize':
      state.fontSize = command.size
      break
    case 'InitializePrinter': {
      const preserved = state.paperWidth
      const next = createDefaultPrinterState()
      next.paperWidth = preserved
      Object.assign(state, next)
      break
    }
    case 'Unknown':
      break
  }
}

function currentStyle(state: PrinterState): TextLine {
  return {
    text: '',
    font: state.currentFont,
    justification: state.justification,
    emphasis: state.emphasis,
    underline: state.underline,
    italic: state.italic,
    fontSize: state.fontSize
  }
}

function stylesMatch(a: TextLine, b: TextLine): boolean {
  return (
    a.font === b.font &&
    a.justification === b.justification &&
    a.emphasis === b.emphasis &&
    a.underline === b.underline &&
    a.italic === b.italic &&
    a.fontSize === b.fontSize
  )
}

function addText(state: PrinterState, text: string): void {
  const style = currentStyle(state)
  const last = state.buffer[state.buffer.length - 1]

  if (last?.kind === 'Text' && stylesMatch(last.line, style)) {
    const maxChars = getMaxChars(state.paperWidth, state.fontSize)
    if (last.line.text.length + text.length > maxChars) {
      const next: TextLine = { ...style, text }
      state.buffer.push({ kind: 'Text', line: next })
    } else {
      last.line.text += text
    }
    return
  }

  state.buffer.push({ kind: 'Text', line: { ...style, text } })
}

function addNewLine(state: PrinterState): void {
  state.buffer.push({ kind: 'Text', line: currentStyle(state) })
}

export function clearBuffer(state: PrinterState): void {
  state.buffer = []
}

export function calculateTotalHeight(state: PrinterState): number {
  let h = 0
  for (const line of state.buffer) {
    switch (line.kind) {
      case 'Text':
        h += state.lineHeight
        break
      case 'Bitmap':
        h += line.heightPx
        break
      case 'Separator':
        h += state.lineHeight
        break
    }
  }
  return Math.max(h, 1)
}
