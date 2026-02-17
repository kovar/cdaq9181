# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web application for communicating with an NI cDAQ-9181 chassis + NI-9215 module (4-channel ±10V analog input) using NI-DAQmx. Reads voltage data via a Python WebSocket bridge, displays live readings with configurable per-channel scaling (voltage → engineering units), plots measurements in real-time, and exports to CSV.

## Architecture

```
index.html              → HTML shell (links CSS + JS modules, CDN scripts)
css/styles.css          → All styles, CSS custom properties for dark/light theming
js/
  main.js               → Entry point: imports modules, wires DOM events
  websocket.js          → WebSocketTransport (JSON protocol over WebSocket)
  connection.js         → ConnectionManager: WebSocket-only, uniform event interface
  chart-manager.js      → ChartManager wrapping Chart.js with date adapter
  recorder.js           → Recorder with Blob-based CSV export (scaled values)
  stats.js              → StatsTracker (Welford's algorithm for live statistics)
  scaling.js            → Per-channel linear scaling (voltage → engineering units)
  ui.js                 → Theme toggle, connection badge, button states, formatting

bridge.py               → NI-DAQmx acquisition engine + WebSocket server
serve.py                → Local dev server (http://localhost:8000)
.github/workflows/static.yml → GitHub Pages deployment (deploys on push to main)
```

No build step. No npm. ES modules loaded via `<script type="module">`. Chart.js + date adapter loaded from CDN with pinned versions.

## Key Difference from Other Apps

The cDAQ-9181 is Ethernet-based, not serial. There is no Web Serial option. The Python bridge is the acquisition engine — it uses the `nidaqmx` library to talk to the hardware and serves JSON data over WebSocket. The browser polls with `{"cmd":"read"}` at the UI interval.

## WebSocket JSON Protocol

**Browser → Bridge:**
- `{"cmd": "info"}` — request device info
- `{"cmd": "configure", "channels": [0,1,2,3], "rate": 1000, "range": 10.0}` — configure task
- `{"cmd": "read"}` — single reading
- `{"cmd": "start"}` — begin streaming (unused, polling preferred)
- `{"cmd": "stop"}` — stop streaming

**Bridge → Browser:**
- `{"type": "reading", "channels": [0.523, -1.207, 3.891, 0.001]}`
- `{"type": "info", "device": "...", "product": "NI 9215", "channels": 4}`
- `{"type": "configured", ...}`
- `{"type": "started"}` / `{"type": "stopped"}`
- `{"type": "error", "message": "..."}`

## Channel Scaling

Per-channel linear scaling converts raw voltage to engineering units: `scaled = slope * voltage + offset`. Config is stored in localStorage and editable from the UI. Default: slope=1, offset=0, unit="V", labels CH1–CH4.

## Deployment

The site is deployed to GitHub Pages automatically on push to `main` via `.github/workflows/static.yml`.

## Running

**Web UI (local development):**
```bash
uv run serve.py     # starts http://localhost:8000 and opens browser
```
Do NOT open `index.html` directly — ES modules require HTTP, not `file://`.

Click Demo to test with fake voltage data (no hardware needed).

**WebSocket Bridge (for real hardware):**
```bash
uv run bridge.py                        # auto-detect DAQ device
uv run bridge.py cDAQ9181-1AE3F21Mod1   # specify device
```
Dependencies (`nidaqmx`, `websockets`, `influxdb-client`) are declared inline via PEP 723 — `uv` installs them automatically.

**Optional InfluxDB logging:**
The bridge can optionally log voltage readings to InfluxDB 2.x. At startup it prompts `Enable InfluxDB logging? [y/N]` — answering N (or pressing Enter) skips it entirely.
