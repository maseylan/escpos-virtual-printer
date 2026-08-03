export type Font = 'A' | 'B' | 'C'

export type Justification = 'Left' | 'Center' | 'Right'

export type EscPosCommand =
  | { type: 'Text'; text: string }
  | { type: 'NewLine' }
  | { type: 'LineFeed' }
  | { type: 'CarriageReturn' }
  | { type: 'SetFont'; font: Font }
  | { type: 'SetFontSize'; size: number }
  | { type: 'SetJustification'; justification: Justification }
  | { type: 'SetEmphasis'; enabled: boolean }
  | { type: 'SetUnderline'; enabled: boolean }
  | { type: 'SetItalic'; enabled: boolean }
  | { type: 'SetLineHeight'; height: number }
  | { type: 'CutPaper' }
  | { type: 'PrintImage'; data: Uint8Array }
  | { type: 'PrintRasterImage'; widthBytes: number; height: number; data: Uint8Array }
  | { type: 'SetCodepage'; codepage: number }
  | { type: 'InitializePrinter' }
  | { type: 'Unknown'; data: Uint8Array }

export const isTextCommand = (c: EscPosCommand): c is Extract<EscPosCommand, { type: 'Text' }> =>
  c.type === 'Text'

export const isRasterImageCommand = (
  c: EscPosCommand
): c is Extract<EscPosCommand, { type: 'PrintRasterImage' }> => c.type === 'PrintRasterImage'

export const isUnknownCommand = (c: EscPosCommand): c is Extract<EscPosCommand, { type: 'Unknown' }> =>
  c.type === 'Unknown'

export function describeCommand(c: EscPosCommand): string {
  switch (c.type) {
    case 'Text':
      return `📝 ${c.text}`
    case 'NewLine':
      return '↵ New line'
    case 'LineFeed':
      return '↴ Line feed'
    case 'CarriageReturn':
      return '⏎ Carriage return'
    case 'SetFont':
      return `🔤 Font: ${c.font}`
    case 'SetFontSize':
      return `🔤 Font size: ${c.size}`
    case 'SetJustification':
      return `📐 Justification: ${c.justification}`
    case 'SetEmphasis':
      return `💪 Emphasis: ${c.enabled ? 'ON' : 'OFF'}`
    case 'SetUnderline':
      return `➖ Underline: ${c.enabled ? 'ON' : 'OFF'}`
    case 'SetItalic':
      return `📝 Italic: ${c.enabled ? 'ON' : 'OFF'}`
    case 'SetLineHeight':
      return `📏 Line height: ${c.height}`
    case 'CutPaper':
      return '✂️ Paper cut'
    case 'PrintImage':
      return `🖼️ Bit Image (ESC *) ${c.data.length} bytes`
    case 'PrintRasterImage':
      return `🖼️ Raster Image (GS v 0) ${c.widthBytes * 8}×${c.height}`
    case 'SetCodepage':
      return `🌐 Codepage: ${c.codepage}`
    case 'InitializePrinter':
      return '🔧 Initialize printer'
    case 'Unknown':
      return `❓ Unknown command (${c.data.length} bytes)`
  }
}
