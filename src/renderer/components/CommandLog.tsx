import { useEffect, useMemo, useRef, useState } from 'react'
import type { EmulatorSnapshot, CommandEntry } from '@shared/types'
import { describeCommand } from '@shared/escpos/commands'

interface Props {
  snapshot: EmulatorSnapshot | null
}

export default function CommandLog({ snapshot }: Props): React.JSX.Element {
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [showRawData, setShowRawData] = useState(false)
  const [filterText, setFilterText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const history = snapshot?.history ?? []

  useEffect(() => {
    const el = listRef.current
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [history.length])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = (): void => {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const filtered = useMemo(() => {
    const f = filterText.trim().toLowerCase()
    if (f === '') return history
    return history.filter((entry) => {
      if (entry.command.type === 'Text') {
        return entry.command.text.toLowerCase().includes(f)
      }
      return describeCommand(entry.command).toLowerCase().includes(f)
    })
  }, [history, filterText])

  const displayed = filtered.slice(-1000).reverse()

  const clearHistory = (): void => {
    void window.api.clearHistory()
  }

  return (
    <div className="command-log">
      <div className="log-toolbar">
        <label>
          <input
            type="checkbox"
            checked={showTimestamps}
            onChange={(e) => setShowTimestamps(e.target.checked)}
          />
          Timestamps
        </label>
        <label>
          <input
            type="checkbox"
            checked={showRawData}
            onChange={(e) => setShowRawData(e.target.checked)}
          />
          Raw data
        </label>
        <label>
          Filter:
          <input type="text" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
        </label>
        <button className="btn" onClick={clearHistory}>
          🗑️ Clear
        </button>
      </div>

      <div className="log-list" ref={listRef}>
        {displayed.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>No commands received</p>
        ) : (
          displayed.map((entry) => (
            <LogEntry
              key={entry.id}
              entry={entry}
              showTimestamps={showTimestamps}
              showRawData={showRawData}
            />
          ))
        )}
      </div>

      <div className="log-stats">
        Total: {history.length} commands | Displayed: {displayed.length} | Filtered: {filtered.length}
      </div>
    </div>
  )
}

function LogEntry({
  entry,
  showTimestamps,
  showRawData
}: {
  entry: CommandEntry
  showTimestamps: boolean
  showRawData: boolean
}): React.JSX.Element {
  return (
    <div className="log-entry">
      <div>
        {showTimestamps && <span className="ts">⏰ {formatElapsed(entry.timestamp)}</span>}
        {describeCommand(entry.command)}
      </div>
      {showRawData && entry.rawData.length > 0 && (
        <div className="hex">🔢 Data: {toHex(entry.rawData)}</div>
      )}
    </div>
  )
}

function formatElapsed(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ')
}
