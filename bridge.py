#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "nidaqmx",
#     "websockets",
#     "influxdb-client",
# ]
# ///
"""
bridge.py — NI-DAQmx acquisition engine + WebSocket server for cDAQ-9181.

Discovers an NI cDAQ device, reads voltage data from an NI-9215 module
(4-channel ±10V analog input), and serves JSON data over WebSocket.

Usage:
    uv run bridge.py                        # auto-detect device
    uv run bridge.py cDAQ9181-1AE3F21Mod1   # specify device

The web app connects to ws://localhost:8765 (default).
"""

import asyncio
import getpass
import json
import sys

import nidaqmx
import nidaqmx.system
from nidaqmx.constants import AcquisitionType, TerminalConfiguration
import websockets


WS_HOST = "localhost"
WS_PORT = 8765

# DAQ defaults
DEFAULT_CHANNELS = [0, 1, 2, 3]
DEFAULT_RATE = 1000  # samples/sec
DEFAULT_RANGE = 10.0  # volts
SAMPLES_PER_READ = 10  # average this many samples per read

# InfluxDB state (set by setup_influxdb)
_influx = None


def find_device(name_hint=None):
    """Discover cDAQ devices. If name_hint is given, look for that specific device."""
    system = nidaqmx.system.System.local()
    devices = list(system.devices)
    if not devices:
        return None

    if name_hint:
        for dev in devices:
            if dev.name == name_hint or dev.name.startswith(name_hint):
                return dev
        print(f"Device '{name_hint}' not found. Available devices:")
        for dev in devices:
            print(f"  {dev.name}  —  {dev.product_type}")
        return None

    if len(devices) == 1:
        dev = devices[0]
        print(f"Found device: {dev.name}  —  {dev.product_type}")
        return dev

    print("Multiple devices found:\n")
    for i, dev in enumerate(devices, 1):
        print(f"  [{i}]  {dev.name}  —  {dev.product_type}")
    print()
    while True:
        try:
            choice = input(f"Type a number [1-{len(devices)}] and press Enter: ").strip()
            idx = int(choice) - 1
            if 0 <= idx < len(devices):
                return devices[idx]
        except (ValueError, EOFError):
            pass
        print(f"  Please enter a number between 1 and {len(devices)}")


def create_task(device, channels=None, rate=None, voltage_range=None):
    """Create and configure an NI-DAQmx analog input task."""
    channels = channels if channels is not None else DEFAULT_CHANNELS
    rate = rate or DEFAULT_RATE
    voltage_range = voltage_range or DEFAULT_RANGE

    task = nidaqmx.Task()
    for ch in channels:
        chan_name = f"{device.name}/ai{ch}"
        task.ai_channels.add_ai_voltage_chan(
            chan_name,
            min_val=-voltage_range,
            max_val=voltage_range,
            terminal_config=TerminalConfiguration.RSE,
        )

    task.timing.cfg_samp_clk_timing(
        rate=rate,
        sample_mode=AcquisitionType.FINITE,
        samps_per_chan=SAMPLES_PER_READ,
    )
    return task


def do_read(task, num_channels):
    """Read samples and return averaged values per channel."""
    data = task.read(number_of_samples_per_channel=SAMPLES_PER_READ)
    # data is list of lists: [[ch0_samples], [ch1_samples], ...]
    # For single channel, nidaqmx returns a flat list
    if num_channels == 1:
        data = [data]
    averages = []
    for ch_data in data:
        avg = sum(ch_data) / len(ch_data)
        averages.append(round(avg, 6))
    return averages


def setup_influxdb():
    """Interactively configure InfluxDB logging. Returns config dict or None."""
    global _influx
    try:
        answer = input("\nEnable InfluxDB logging? [y/N]: ").strip().lower()
    except EOFError:
        return None
    if answer != "y":
        return None

    from influxdb_client import InfluxDBClient

    print("\n── InfluxDB Setup ──────────────────────────────────")
    url = input("URL [http://localhost:8086]: ").strip() or "http://localhost:8086"
    org = input("Organization: ").strip()
    bucket = input("Bucket: ").strip()
    print("API Token")
    print("  (Find yours at: InfluxDB UI → Load Data → API Tokens)")
    token = getpass.getpass("  Token: ")
    measurement = input("Measurement name: ").strip()
    print("  Use snake_case, e.g. cdaq9181_lab1")

    if not all([org, bucket, token, measurement]):
        print("Missing required fields — InfluxDB logging disabled.")
        return None

    print("\nTesting connection... ", end="", flush=True)
    client = InfluxDBClient(url=url, token=token, org=org)
    try:
        health = client.health()
        if health.status != "pass":
            print(f"✗ ({health.message})")
            client.close()
            return None
    except Exception as e:
        print(f"✗ ({e})")
        client.close()
        return None
    print("✓")

    write_api = client.write_api()
    _influx = {
        "client": client,
        "write_api": write_api,
        "bucket": bucket,
        "org": org,
        "measurement": measurement,
    }
    print(f"InfluxDB logging enabled → {org}/{bucket}/{measurement}\n")
    return _influx


def close_influxdb():
    """Flush pending writes and close the InfluxDB client."""
    global _influx
    if _influx:
        print("Flushing InfluxDB...", end=" ", flush=True)
        try:
            _influx["write_api"].close()
            _influx["client"].close()
        except Exception:
            pass
        print("done.")
        _influx = None


def write_influx_point(channels):
    """Write a 4-channel voltage reading to InfluxDB."""
    if not _influx:
        return
    from influxdb_client import Point

    point = Point(_influx["measurement"])
    for i, v in enumerate(channels):
        point = point.field(f"ch{i}", v)
    try:
        _influx["write_api"].write(
            bucket=_influx["bucket"],
            org=_influx["org"],
            record=point,
        )
    except Exception as e:
        print(f"  InfluxDB write error: {e}")


# ── WebSocket Handler ─────────────────────────────────────────

class DAQSession:
    """Per-connection DAQ session state."""

    def __init__(self, device):
        self.device = device
        self.task = None
        self.channels = list(DEFAULT_CHANNELS)
        self.rate = DEFAULT_RATE
        self.voltage_range = DEFAULT_RANGE

    def ensure_task(self):
        """Create task if not already created."""
        if self.task is None:
            self.task = create_task(
                self.device, self.channels, self.rate, self.voltage_range
            )

    def close_task(self):
        """Close current task if open."""
        if self.task is not None:
            try:
                self.task.close()
            except Exception:
                pass
            self.task = None


async def handle_client(ws, device):
    """Handle a single WebSocket client connection."""
    peer = getattr(ws, "remote_address", None)
    print(f"  Client connected: {peer}")
    session = DAQSession(device)

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON",
                }))
                continue

            cmd = msg.get("cmd")

            if cmd == "info":
                await ws.send(json.dumps({
                    "type": "info",
                    "device": device.name,
                    "product": device.product_type,
                    "channels": len(device.ai_physical_chans),
                }))

            elif cmd == "configure":
                session.close_task()
                session.channels = msg.get("channels", DEFAULT_CHANNELS)
                session.rate = msg.get("rate", DEFAULT_RATE)
                session.voltage_range = msg.get("range", DEFAULT_RANGE)
                try:
                    session.ensure_task()
                    await ws.send(json.dumps({
                        "type": "configured",
                        "channels": session.channels,
                        "rate": session.rate,
                        "range": session.voltage_range,
                    }))
                except Exception as e:
                    await ws.send(json.dumps({
                        "type": "error",
                        "message": f"Configure failed: {e}",
                    }))

            elif cmd == "read":
                try:
                    session.ensure_task()
                    values = await asyncio.get_event_loop().run_in_executor(
                        None, do_read, session.task, len(session.channels)
                    )
                    await ws.send(json.dumps({
                        "type": "reading",
                        "channels": values,
                    }))
                    write_influx_point(values)
                    # Recreate task for next read (finite acquisition)
                    session.close_task()
                except Exception as e:
                    session.close_task()
                    await ws.send(json.dumps({
                        "type": "error",
                        "message": f"Read failed: {e}",
                    }))

            elif cmd == "stop":
                session.close_task()
                await ws.send(json.dumps({"type": "stopped"}))

            else:
                await ws.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown command: {cmd}",
                }))

    except websockets.ConnectionClosed:
        pass
    finally:
        session.close_task()
        print(f"  Client disconnected: {peer}")


async def main():
    name_hint = sys.argv[1] if len(sys.argv) > 1 else None
    device = find_device(name_hint)
    if not device:
        print("No DAQ devices found. Check that:")
        print("  1. The cDAQ-9181 is powered on and connected via Ethernet")
        print("  2. NI-DAQmx driver is installed")
        print("  3. The device appears in NI MAX")
        if name_hint:
            print(f"\nOr specify a different device: uv run bridge.py <device-name>")
        sys.exit(1)

    print(f"Using device: {device.name} ({device.product_type})")

    setup_influxdb()

    print(f"Starting WebSocket server on ws://{WS_HOST}:{WS_PORT}")
    print("Web app can now connect via the Connect button.\n")

    async with websockets.serve(
        lambda ws: handle_client(ws, device), WS_HOST, WS_PORT
    ):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        close_influxdb()
        print("\nBridge stopped.")
