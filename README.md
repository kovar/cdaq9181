# cDAQ-9181 Data Acquisition

Web application for reading voltage data from an NI cDAQ-9181 chassis with NI-9215 module (4-channel ±10V analog input).

**[Live Demo](https://kovar.github.io/cdaq9181/)** — click Demo to try with simulated data.

## Requirements

### NI-DAQmx Driver

`bridge.py` requires the NI-DAQmx runtime installed on the machine running the bridge. The `nidaqmx` Python package (installed automatically by `uv`) is a thin wrapper around this driver.

**Windows**
1. Download **NI-DAQmx** from [ni.com → Downloads → NI-DAQmx](https://www.ni.com/en/support/downloads/drivers/download.ni-daq-mx.html)
2. Run the installer (~500 MB, reboot likely required)
3. Verify the cDAQ-9181 appears in **NI Measurement & Automation Explorer (NI MAX)**

**Linux** (Ubuntu 20.04/22.04, RHEL/CentOS)
```bash
# Download the NI Linux Device Drivers installer
wget https://download.ni.com/ni-linux-installer/ni-linux-installer.sh
chmod +x ni-linux-installer.sh
sudo ./ni-linux-installer.sh
# Choose NI-DAQmx from the package list
```
Full instructions: [NI Linux Device Drivers](https://www.ni.com/en/support/downloads/drivers/download.ni-linux-device-drivers.html)

**macOS** — NI-DAQmx is not available for macOS. Run `bridge.py` on a Windows or Linux machine and connect the browser to that machine's IP (`ws://<host>:8765`).

### Python

Install [`uv`](https://github.com/astral-sh/uv) if you haven't — it handles the Python environment and all package dependencies automatically:
```bash
pip install uv
```

## Quick Start

```bash
# Web UI (click Demo for fake data — no hardware needed)
uv run serve.py

# Bridge for real hardware (requires NI-DAQmx driver, see above)
uv run bridge.py
```

## Features

- 4-channel voltage acquisition via NI-DAQmx
- Configurable per-channel scaling (voltage → engineering units)
- Real-time chart with Chart.js
- Running statistics (min/max/mean) per channel
- CSV recording and export
- Dark/light theme
- Optional InfluxDB logging

## Architecture

No build step. ES modules served over HTTP. The Python bridge is the DAQ acquisition engine — it uses `nidaqmx` to read from the hardware and serves JSON data over WebSocket.

| File | Purpose |
|------|---------|
| `bridge.py` | NI-DAQmx acquisition + WebSocket server |
| `index.html` | App shell |
| `js/main.js` | Entry point, wires modules |
| `js/scaling.js` | Per-channel linear scaling + localStorage |
| `js/websocket.js` | WebSocket transport (JSON protocol) |
| `js/connection.js` | Connection manager |
| `js/chart-manager.js` | 4-channel Chart.js chart |
| `js/recorder.js` | CSV recording |
| `js/stats.js` | Welford's online statistics |
| `js/ui.js` | UI helpers |

## Hardware

- **Chassis:** NI cDAQ-9181 (1-slot, Ethernet)
- **Module:** NI-9215 (4-channel, ±10V, 16-bit simultaneous sampling)
- **Connection:** Ethernet (no USB/serial)
