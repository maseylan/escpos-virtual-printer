import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isWindows, isMac } from '../util/platform'
import { log } from '../util/log'

const execFileAsync = promisify(execFile)

export const WINDOWS_PRINTER_NAME = 'ESC_POS_Virtual_Printer'
export const WINDOWS_PORT_NAME = '127.0.0.1:9100'
export const LINUX_PRINTER_NAME = 'ESC_POS_Linux_Printer'
export const MACOS_PRINTER_NAME = 'ESC_POS_MacOS_Printer'
export const CUPS_PRINTER_URI = 'socket://127.0.0.1:9100'

export async function installWindowsPrinter(): Promise<string> {
  if (!isWindows) return '❌ Windows printer install is only available on Windows'

  const script = [
    `Add-PrinterPort -Name '${WINDOWS_PORT_NAME}' -PrinterHostAddress '127.0.0.1' -PortNumber 9100`,
    `$driver = (Get-PrinterDriver | Where-Object { $_.Name -like '*Microsoft*' } | Select-Object -First 1).Name`,
    `Add-Printer -Name '${WINDOWS_PRINTER_NAME}' -DriverName $driver -PortName '${WINDOWS_PORT_NAME}'`,
    `Write-Host 'Windows printer installed successfully!'`
  ].join('; ')

  return runElevatedPowerShell(script)
}

export async function uninstallWindowsPrinter(): Promise<string> {
  if (!isWindows) return '❌ Windows printer uninstall is only available on Windows'

  const script = [
    `Remove-Printer -Name '${WINDOWS_PRINTER_NAME}' -Confirm:$false`,
    `Remove-PrinterPort -Name '${WINDOWS_PORT_NAME}'`,
    `Write-Host 'Printer uninstalled successfully'`
  ].join('; ')

  return runElevatedPowerShell(script)
}

export async function checkWindowsPrinter(): Promise<string> {
  if (!isWindows) return '❌ Windows printer check is only available on Windows'

  const script = [
    `$p = Get-Printer -Name '${WINDOWS_PRINTER_NAME}' -ErrorAction SilentlyContinue`,
    `if ($p) { Write-Output ($p | Select-Object Name, PortName, DriverName, PrinterStatus | Format-List | Out-String) } else { Write-Output 'NOT_INSTALLED' }`
  ].join('; ')

  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script], {
      timeout: 30000,
      windowsHide: true
    })
    const out = stdout.trim()
    if (out === '' || out === 'NOT_INSTALLED') {
      return 'ℹ️ Virtual printer not installed on Windows'
    }
    return `✅ Virtual printer installed:\n${out}`
  } catch (err) {
    return `❌ Could not check printer status: ${String(err)}`
  }
}

/**
 * Run a PowerShell script with UAC elevation when the current process is not
 * elevated. Elevated runs lose stdout, so status is best-effort.
 */
async function runElevatedPowerShell(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-Command', script],
      { timeout: 60000, windowsHide: true }
    )
    const out = stdout.trim()
    return out ? `✅ ${out}` : '✅ Command executed successfully.'
  } catch (err) {
    const msg = String(err)
    if (/The operation was canceled|denied by the user/i.test(msg)) {
      return 'ℹ️ UAC prompt was canceled — printer was not installed.'
    }
    log.warn(`PowerShell elevated execution failed: ${msg}`)
    return elevateWithRunAs(script)
  }
}

function elevateWithRunAs(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve) => {
    execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`
      ],
      { timeout: 10000, windowsHide: true }
    )
      .then(() => {
        resolve('ℹ️ Elevation prompt sent. Run as administrator to verify installation.')
      })
      .catch((err) => {
        resolve(`❌ Cannot execute PowerShell: ${String(err)}`)
      })
  })
}

export function installCupsPrinter(): Promise<string> {
  return installCupsPrinterNamed(isMac ? MACOS_PRINTER_NAME : LINUX_PRINTER_NAME, isMac ? 'macOS' : 'Linux')
}

export function uninstallCupsPrinter(): Promise<string> {
  return uninstallCupsPrinterNamed(isMac ? MACOS_PRINTER_NAME : LINUX_PRINTER_NAME, isMac ? 'macOS' : 'Linux')
}

export function checkCupsPrinter(): Promise<string> {
  return checkCupsPrinterNamed(isMac ? MACOS_PRINTER_NAME : LINUX_PRINTER_NAME, isMac ? 'macOS' : 'Linux')
}

async function installCupsPrinterNamed(printerName: string, osLabel: string): Promise<string> {
  if (isWindows) return `❌ ${osLabel} printer install is only available on ${osLabel}`

  const setup = [
    `lpadmin -p '${printerName}' -E -v '${CUPS_PRINTER_URI}' -m raw`,
    `lpadmin -d '${printerName}'`
  ].join(' && ')

  return runLinuxElevated(
    setup,
    `${osLabel} printer (${printerName}) installed successfully!`
  )
}

async function uninstallCupsPrinterNamed(printerName: string, osLabel: string): Promise<string> {
  if (isWindows) return `❌ ${osLabel} printer uninstall is only available on ${osLabel}`
  return runLinuxElevated(
    `lpadmin -x '${printerName}'`,
    `${osLabel} printer (${printerName}) uninstalled successfully.`
  )
}

async function checkCupsPrinterNamed(printerName: string, osLabel: string): Promise<string> {
  if (isWindows) return `❌ ${osLabel} printer check is only available on ${osLabel}`
  try {
    const { stdout } = await execFileAsync('lpstat', ['-p', printerName])
    const out = stdout.trim()
    if (out.includes(`printer ${printerName}`)) {
      return `✅ Printer Status:\n${out}`
    }
    return `ℹ️ ${osLabel} virtual printer not installed (or not found). Output:\n${out}`
  } catch {
    return `ℹ️ ${osLabel} virtual printer not installed (${printerName} not found).`
  }
}

/**
 * Run a CUPS command with elevation. Uses pkexec when available (Linux),
 * otherwise sudo (Linux/macOS).
 */
async function runLinuxElevated(commands: string, successMessage: string): Promise<string> {
  const tryRun = async (prefix: string): Promise<boolean> => {
    try {
      await execFileAsync('bash', ['-c', `${prefix} ${commands}`], { timeout: 60000 })
      return true
    } catch (err) {
      const msg = String(err)
      log.warn(`CUPS elevated command failed (${prefix}): ${msg}`)
      return false
    }
  }

  try {
    const { stdout } = await execFileAsync('bash', ['-c', `command -v pkexec`])
    if (stdout.trim()) {
      if (await tryRun('pkexec')) return `✅ ${successMessage}`
    }
  } catch {
    // pkexec not available (e.g. macOS) — fall through to sudo
  }

  if (await tryRun('sudo')) return `✅ ${successMessage}`

  return '❌ Installation failed. Please run the command manually with root privileges.'
}
