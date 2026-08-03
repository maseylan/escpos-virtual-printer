import { useEffect, useMemo, useRef, useState } from 'react'
import type { EmulatorSnapshot } from '@shared/types'
import {
  PAPER_WIDTH_META,
  getWidthDots,
  getMaxChars,
  type PaperWidth,
  type ReceiptLine,
  type TextLine
} from '@shared/escpos/printer'
import type { Font, Justification } from '@shared/escpos/commands'

interface Props {
  snapshot: EmulatorSnapshot | null
}

type SubTab = 'preview' | 'raw'

const PAPER_WIDTH_PX: Record<PaperWidth, number> = {
  Width50mm: 340,
  Width78mm: 440,
  Width80mm: 490
}

const PAPER_WIDTH_MM = [50, 78, 80] as const

const FONT_SIZES: Record<Font, number> = { A: 13.5, B: 11.5, C: 10 }

export default function ReceiptViewer({ snapshot }: Props): React.JSX.Element {
  const [subTab, setSubTab] = useState<SubTab>('preview')
  const [showShadow, setShowShadow] = useState(true)
  const [zoom, setZoom] = useState(1)

  const printer = snapshot?.printer
  const buffer = printer?.buffer ?? []
  const paperWidth = printer?.paperWidth ?? 'Width80mm'

  const paperWidthPx = useMemo(
    () => PAPER_WIDTH_PX[paperWidth] * zoom,
    [paperWidth, zoom]
  )

  const setPaperWidth = (mm: number): void => {
    void window.api.setPaperWidth(mm)
  }

  const clearBuffer = (): void => {
    void window.api.clearBuffer()
  }

  return (
    <div className="receipt-viewer">
      <div className="receipt-toolbar">
        <button
          className={`subtab-btn ${subTab === 'preview' ? 'active' : ''}`}
          onClick={() => setSubTab('preview')}
        >
          📄 Real Preview
        </button>
        <button
          className={`subtab-btn ${subTab === 'raw' ? 'active' : ''}`}
          onClick={() => setSubTab('raw')}
        >
          📝 Raw Text
        </button>
        <div className="toolbar-sep" />
        <span>📏 Paper Width:</span>
        {PAPER_WIDTH_MM.map((mm) => (
          <button
            key={mm}
            className={`subtab-btn ${PAPER_WIDTH_META[paperWidth].mm === mm ? 'active' : ''}`}
            onClick={() => setPaperWidth(mm)}
          >
            {mm}mm
          </button>
        ))}
        <div className="toolbar-sep" />
        {subTab === 'preview' && (
          <>
            <label>
              <input
                type="checkbox"
                checked={showShadow}
                onChange={(e) => setShowShadow(e.target.checked)}
              />
              Shadow
            </label>
            <label>
              Zoom
              <input
                type="range"
                min={0.75}
                max={1.4}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
              />
            </label>
          </>
        )}
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={clearBuffer} title="Clear current receipt buffer">
          🗑️ Clear
        </button>
      </div>

      {subTab === 'preview' ? (
        <div className="workbench">
          <div>
            <div className="dispenser" style={{ width: paperWidthPx }}>
              <span className="green-dot">●</span>
              <span>
                PRINTER DISPENSER | {PAPER_WIDTH_META[paperWidth].label} ({getWidthDots(paperWidth)} dots)
              </span>
              <span className="lines-count">{buffer.length} Lines</span>
            </div>
            <div className="dispenser-slot" style={{ width: paperWidthPx }} />
            <div className={`paper ${showShadow ? '' : 'no-shadow'}`} style={{ width: paperWidthPx }}>
              {buffer.length === 0 ? (
                <div className="paper-empty">
                  <h3>📄 Thermal Paper Ready</h3>
                  <p>
                    No print data received yet.
                    <br />
                    Send raw ESC/POS commands via TCP port 9100 or virtual serial port.
                  </p>
                </div>
              ) : (
                <>
                  {buffer.map((line, i) => (
                    <ReceiptLineView key={i} line={line} zoom={zoom} paperWidthPx={paperWidthPx} />
                  ))}
                  <div className="tear-here">✂ ----------------- TEAR HERE ----------------- ✂</div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <RawTextView snapshot={snapshot} />
      )}
    </div>
  )
}

function ReceiptLineView({
  line,
  zoom,
  paperWidthPx
}: {
  line: ReceiptLine
  zoom: number
  paperWidthPx: number
}): React.JSX.Element | null {
  switch (line.kind) {
    case 'Text':
      return <TextLineView line={line.line} zoom={zoom} />
    case 'Bitmap':
      return <BitmapLineView line={line} paperWidthPx={paperWidthPx} zoom={zoom} />
    case 'Separator':
      return (
        <div className="cut-separator">
          <span className="line" />
          ✂ --- CUT PAPER --- ✂
          <span className="line" />
        </div>
      )
  }
}

function TextLineView({ line, zoom }: { line: TextLine; zoom: number }): React.JSX.Element {
  if (line.text.trim() === '') {
    return <div style={{ height: 8 * zoom }} />
  }

  const baseSize = FONT_SIZES[line.font] * zoom
  const size = line.fontSize > 12 ? baseSize * 1.3 : baseSize

  const justifyClass: Record<Justification, string> = {
    Left: 'left',
    Center: 'center',
    Right: 'right'
  }

  const isQr = line.text.includes('[ QR CODE:')

  if (isQr) {
    return (
      <div className="qr-box">
        <div className="qr-label">📱 QR CODE</div>
        <div className="receipt-line" style={{ fontSize: size }}>
          {line.text}
        </div>
      </div>
    )
  }

  const classes = [
    'receipt-line',
    line.font === 'B' ? 'ln-b' : line.font === 'C' ? 'ln-c' : 'ln-a',
    line.emphasis ? 'b' : '',
    line.underline ? 'u' : '',
    line.italic ? 'i' : '',
    justifyClass[line.justification]
  ].join(' ')

  return (
    <div className={classes} style={{ fontSize: size }}>
      {line.text}
    </div>
  )
}

function BitmapLineView({
  line,
  paperWidthPx,
  zoom
}: {
  line: Extract<ReceiptLine, { kind: 'Bitmap' }>
  paperWidthPx: number
  zoom: number
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { widthPx, heightPx, data } = line

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const imageData = ctx.createImageData(widthPx, heightPx)
    const bytesPerRow = Math.ceil(widthPx / 8)
    for (let y = 0; y < heightPx; y++) {
      for (let x = 0; x < widthPx; x++) {
        const byteIdx = y * bytesPerRow + (x >> 3)
        const bitIdx = 7 - (x % 8)
        const bit = byteIdx < data.length ? (data[byteIdx]! >> bitIdx) & 1 : 0
        const px = (y * widthPx + x) * 4
        imageData.data[px] = bit ? 0 : 255
        imageData.data[px + 1] = bit ? 0 : 255
        imageData.data[px + 2] = bit ? 0 : 255
        imageData.data[px + 3] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [widthPx, heightPx, data])

  const scale = Math.min((paperWidthPx - 60) / widthPx, 1.5) * zoom

  return (
    <div className="bitmap-line">
      <canvas
        ref={canvasRef}
        width={widthPx}
        height={heightPx}
        style={{ width: widthPx * scale, height: heightPx * scale, imageRendering: 'pixelated' }}
      />
    </div>
  )
}

function RawTextView({ snapshot }: Props): React.JSX.Element {
  const printer = snapshot?.printer
  const buffer = printer?.buffer ?? []

  if (!printer || buffer.length === 0) {
    return (
      <div className="raw-view">
        <p style={{ color: 'var(--text-dim)' }}>No receipt data available</p>
      </div>
    )
  }

  const maxChars = getMaxChars(printer.paperWidth, printer.fontSize)

  return (
    <div className="raw-view">
      <div className="raw-meta">
        <span>📄 Paper: {printer.paperWidth}</span>
        <span>🔤 Font: {printer.currentFont}</span>
        <span>📐 Align: {printer.justification}</span>
        {printer.codepage !== 0 && <span>🌐 CP: {printer.codepage}</span>}
      </div>
      {buffer.map((line, i) => {
        const num = String(i + 1).padStart(3, '0')
        switch (line.kind) {
          case 'Text':
            return (
              <div className="raw-line" key={i}>
                <span className="num">{num}</span>
                <span className="sep">│</span>
                <span className={line.line.emphasis ? 'b' : ''}>{line.line.text}</span>
              </div>
            )
          case 'Bitmap':
            return (
              <div className="raw-line" key={i}>
                <span className="num">{num}</span>
                <span className="sep">│</span>
                <span>[ RASTER BITMAP: {line.widthPx}x{line.heightPx} px ]</span>
              </div>
            )
          case 'Separator':
            return (
              <div className="raw-line" key={i}>
                <span className="num">{num}</span>
                <span className="sep">│</span>
                <span>{'─'.repeat(Math.min(maxChars, 72))}</span>
              </div>
            )
        }
      })}
      <div className="cut-separator" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        ✂️ Cut line
      </div>
    </div>
  )
}
