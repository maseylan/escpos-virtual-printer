import { useEffect, useState } from 'react'
import type { EmulatorSnapshot } from '@shared/types'
import { DEFAULT_BAUD_RATES } from '@shared/types'

interface Props {
  snapshot: EmulatorSnapshot | null
}

export default function SettingsPanel({ snapshot }: Props): React.JSX.Element {
  const [ports, setPorts] = useState<string[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const [baudRate, setBaudRate] = useState(9600)
  const [serialRunning, setSerialRunning] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const platform = window.api.platform

  const installLabel =
    platform === 'darwin' ? '🍎 Install macOS Printer' : platform === 'win32' ? '🖨️ Install Windows Printer' : '🐧 Install Linux Printer'

  const installPrinter = async (): Promise<void> => {
    setStatusMessage(
      platform === 'win32' ? await window.api.installPrinterWindows() : await window.api.installPrinterLinux()
    )
  }

  useEffect(() => {
    refreshPorts()
    return () => {
      void window.api.stopSerial()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshPorts = async (): Promise<void> => {
    const list = await window.api.getSerialPorts()
    setPorts(list)
    if (list.length > 0 && !list.includes(selectedPort)) {
      setSelectedPort(list[0] ?? '')
    }
  }

  const startSerial = async (): Promise<void> => {
    if (!selectedPort) {
      setStatusMessage('No serial port selected')
      return
    }
    const result = await window.api.startSerial(selectedPort, baudRate)
    setStatusMessage(result.message)
    if (result.ok) setSerialRunning(true)
  }

  const stopSerial = async (): Promise<void> => {
    const result = await window.api.stopSerial()
    setStatusMessage(result.message)
    if (result.ok) setSerialRunning(false)
  }

  const installWindows = async (): Promise<void> => {
    setStatusMessage(await window.api.installPrinterWindows())
  }

  const installCups = async (): Promise<void> => {
    setStatusMessage(await window.api.installPrinterLinux())
  }

  const uninstall = async (): Promise<void> => {
    setStatusMessage(await window.api.uninstallPrinter())
  }

  const checkStatus = async (): Promise<void> => {
    setStatusMessage(await window.api.checkPrinter())
  }

  const testConnection = async (): Promise<void> => {
    setStatusMessage(await window.api.testConnection())
  }

  const port = snapshot?.serverPort ?? 9100
  const address = snapshot?.serverAddress ?? '127.0.0.1'

  return (
    <div className="settings-panel">
      <div className="settings-group">
        <h3>Virtual Printer Management</h3>
        <p className="desc">Installs the emulator as a system printer (TCP port {port})</p>
        <div className="row">
          {platform === 'win32' && (
            <button className="btn" onClick={installWindows}>
              🖨️ Install Windows Printer
            </button>
          )}
          {platform !== 'win32' && (
            <button className="btn" onClick={installCups}>
              {installLabel}
            </button>
          )}
          <button className="btn" onClick={uninstall}>
            🗑️ Uninstall Printer
          </button>
          <button className="btn" onClick={checkStatus}>
            🔍 Check Printer Status
          </button>
        </div>
        <p className="desc">Note: Requires administrator / root privileges</p>
      </div>

      <div className="settings-group">
        <h3>Serial / COM Port (USB Virtual)</h3>
        <p className="desc">Receives ESC/POS data via a virtual COM port pair (com0com)</p>
        <div className="row">
          <label>
            Port:
            <select value={selectedPort} onChange={(e) => setSelectedPort(e.target.value)}>
              {ports.length === 0 && <option value="">No ports found</option>}
              {ports.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={refreshPorts} title="Refresh available ports">
            🔄
          </button>
          <label>
            Baud:
            <select
              value={baudRate}
              onChange={(e) => setBaudRate(parseInt(e.target.value, 10))}
            >
              {DEFAULT_BAUD_RATES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          {serialRunning ? (
            <button className="btn" onClick={stopSerial}>
              ⏹ Stop Serial Listener
            </button>
          ) : (
            <button className="btn" disabled={ports.length === 0} onClick={startSerial}>
              ▶ Start Serial Listener
            </button>
          )}
          <span style={{ color: serialRunning ? 'var(--accent)' : '#e74c3c' }}>
            ● {serialRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
        <pre className="guide">
          com0com Setup Guide
          {'\n'}1. Download: sourceforge.net/projects/com0com
          {'\n'}2. Install com0com (run as administrator)
          {'\n'}3. Open com0com Setup and create a pair (e.g. COM3 {"<->"} COM4)
          {'\n'}4. Configure your PDV/POS to send to COM3
          {'\n'}5. Select COM4 in this emulator and click Start
          {'\n'}All data sent to COM3 will appear as a receipt here in real time.
        </pre>
      </div>

      <div className="settings-group">
        <h3>Network Configuration</h3>
        <p className="desc">
          TCP Port: {port} | Address: {address} | {snapshot?.serverRunning ? '● Running' : '● Stopped'}
        </p>
        <button className="btn" onClick={testConnection}>
          📡 Test Connection
        </button>
      </div>

      <div className="settings-group">
        <h3>ℹ️ Automatic Operation</h3>
        <p className="guide">
          • The emulator automatically respects ESC/POS standards
          {'\n'}• Paper width: 50mm, 78mm, 80mm (auto-detection)
          {'\n'}• Font, justification, emphasis: ESC/POS commands
          {'\n'}• No manual configuration needed!
        </p>
      </div>

      {statusMessage && <div className="status-msg">{statusMessage}</div>}
    </div>
  )
}
