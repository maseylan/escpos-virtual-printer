# 🖨️ ESC/POS Virtual Printer Emulator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](https://github.com/your-username/escpos-virtual-printer-emulator)

> **ESC/POS virtual printer emulator built with Node.js + Electron + React + TypeScript**
> Turn your computer into a virtual receipt printer for testing and development.

## Features

- **Raw TCP server** on `127.0.0.1:9100` — receive ESC/POS data from any POS app
- **Web HTTP POST + CORS** — callable directly from browsers/web apps
- **Serial / COM port listener** — works with virtual COM pairs (com0com)
- **Real-time receipt preview** — thermal paper rendering, zoom, paper width (50/78/80mm)
- **Command log** — filterable history with timestamps and raw hex data
- **System printer installation** — Windows (PowerShell), Linux & macOS (CUPS)

## Prerequisites

- **Node.js 20+** — [Install Node.js](https://nodejs.org/)
- **Windows 10/11**, **Linux** (CUPS), or **macOS** (CUPS)
- Administrator/root privileges (for printer installation only)

## Installation

```bash
git clone https://github.com/your-username/escpos-virtual-printer-emulator.git
cd escpos-virtual-printer-emulator

# or simply copy this project folder

npm install
```

## Usage

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build

# Run tests
npm test
```

1. **Start the app** — the GUI opens with the server already listening on port 9100
2. **Install the virtual printer** — go to the **Settings** tab and click *Install Windows/Linux/macOS Printer*
3. **Print from any application** — select `ESC_POS_Virtual_Printer` (Windows), `ESC_POS_Linux_Printer` (Linux), or `ESC_POS_MacOS_Printer` (macOS)
4. **View results** — check the **Receipt** tab for the live preview

### Manual test without a printer

```bash
# Send a simple receipt via TCP
printf '\x1b\x40Hello World\n\x1b\x61\x01Center\n\x1b\x6d' | nc 127.0.0.1 9100
```

### Serial / COM port

1. Install [com0com](https://sourceforge.net/projects/com0com/) (Windows) and create a COM pair (e.g. `COM3 <-> COM4`)
2. Point your POS/PDV to `COM3`
3. In the app's **Settings** tab, select `COM4`, choose the baud rate, and click **Start Serial Listener**

## Packaging (optional)

```bash
npm run dist:win      # Windows NSIS installer
npm run dist:linux    # Linux AppImage + deb
npm run dist:mac      # macOS dmg (requires macOS)
```

Output goes to `release/`:

- **Linux AppImage** — run directly; requires `libfuse2` on Debian/Ubuntu (`sudo apt install libfuse2`)
- **Linux deb** — `sudo dpkg -i release/*.deb`
- **Windows** — run the NSIS installer
- **macOS dmg** — build and sign on a Mac (`npm run dist:mac`); the resulting `.dmg` mounts to a drag-and-drop app. Since `serialport` is a native module, the app must be built on macOS — cross-building from Linux/Windows is not supported for `.dmg`

> If you see a SUID sandbox error when running the unpacked build, either run with `--no-sandbox` or fix the sandbox permissions: `sudo chown root:root release/linux-unpacked/chrome-sandbox && sudo chmod 4755 release/linux-unpacked/chrome-sandbox`

## Project Structure

```
src/
├── main/          # Electron main process (server, serial, IPC, printer install)
├── preload/       # contextBridge API for the renderer
├── renderer/      # React UI (ReceiptViewer, CommandLog, SettingsPanel)
└── shared/        # Pure logic: ESC/POS parser, printer model, types
tests/             # Vitest unit + integration tests
```

## License

MIT — see [LICENSE](LICENSE).
