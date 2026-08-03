import { useState } from 'react'
import { useEmulatorState } from './hooks/useEmulatorState'
import ReceiptViewer from './components/ReceiptViewer'
import CommandLog from './components/CommandLog'
import SettingsPanel from './components/SettingsPanel'

type Tab = 'receipt' | 'commands' | 'settings'

export default function App(): React.JSX.Element {
  const snapshot = useEmulatorState()
  const [tab, setTab] = useState<Tab>('receipt')

  return (
    <div className="app">
      <header className="app-header">
        <button
          className={`tab-btn ${tab === 'receipt' ? 'active' : ''}`}
          onClick={() => setTab('receipt')}
        >
          🖨️ Receipt
        </button>
        <button
          className={`tab-btn ${tab === 'commands' ? 'active' : ''}`}
          onClick={() => setTab('commands')}
        >
          📋 Commands
        </button>
        <button
          className={`tab-btn ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          ⚙️ Settings
        </button>
        <div className="server-badge">
          <span className={`dot ${snapshot?.serverRunning ? 'green' : 'red'}`} />
          Server {snapshot?.serverRunning ? `on ${snapshot.serverAddress}:${snapshot.serverPort}` : 'stopped'}
        </div>
      </header>

      <main className="app-body">
        {tab === 'receipt' && <ReceiptViewer snapshot={snapshot} />}
        {tab === 'commands' && <CommandLog snapshot={snapshot} />}
        {tab === 'settings' && <SettingsPanel snapshot={snapshot} />}
      </main>
    </div>
  )
}
