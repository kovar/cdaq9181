# cDAQ-9181 Data Acquisition

Web application for reading voltage data from an NI cDAQ-9181 chassis with NI-9215 module (4-channel ±10V analog input).

**[Live Demo](https://kovar.github.io/cdaq9181/)** — click Demo to try with simulated data.

## Quick Start

```bash
# Web UI (click Demo for fake data)
uv run serve.py

# Bridge for real hardware
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
