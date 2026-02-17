/**
 * main.js — Entry point. Wires all modules together for cDAQ-9181 data acquisition.
 */
import { ConnectionManager } from './connection.js';
import { ChartManager } from './chart-manager.js';
import { Recorder } from './recorder.js';
import { StatsTracker } from './stats.js';
import { loadScaling, saveScaling, applyScaling } from './scaling.js';
import {
  setConnectionState, setMeasurementState, setRecordingState,
  updateReadout, updateStats, updateDeviceInfo,
  appendLog, showToast,
} from './ui.js';

// ── Instances ──────────────────────────────────────────────
const conn = new ConnectionManager();
let chart;
const recorder = new Recorder();
const channelStats = [new StatsTracker(), new StatsTracker(), new StatsTracker(), new StatsTracker()];
let scaling = loadScaling();
let measurementInterval = null;
let measurementTimeout = null;
let lastReadingTime = 0;
let lastPlotTime = 0;
let demoInterval = null;
let demoState = null;

// ── DOM Ready ──────────────────────────────────────────────
window._cdaq9181ModulesLoaded = true;

document.addEventListener('DOMContentLoaded', () => {
  wireConnection();
  wireToolbar();
  wireScaling();

  setConnectionState(false);
  setMeasurementState(false);
  setRecordingState(false);

  try {
    chart = new ChartManager(
      document.getElementById('chartCanvas'),
      scaling.map(s => s.label),
    );
    wireChart();
  } catch (err) {
    appendLog('Chart init failed: ' + err.message);
  }
});

// ── Connection Events ──────────────────────────────────────
function wireConnection() {
  conn.addEventListener('connected', () => {
    setConnectionState(true);
    appendLog('Connected');
    showToast('Connected to bridge', 'success');
    // Request device info
    conn.send({ cmd: 'info' });
  });

  conn.addEventListener('disconnected', () => {
    stopMeasurement();
    setConnectionState(false);
    appendLog('Disconnected');
    showToast('Disconnected', 'info');
  });

  conn.addEventListener('reading', (e) => {
    const { channels: rawChannels } = e.detail;
    const now = Date.now();
    lastReadingTime = now;
    const scaled = applyScaling(rawChannels, scaling);

    // Always: stats + recorder (cheap, need full resolution)
    for (let i = 0; i < 4; i++) {
      channelStats[i].addValue(scaled[i]);
    }
    recorder.addReading(scaled);

    // Throttled: chart, readout, stats display, log
    const plotInterval = getPlotIntervalMs();
    if (now - lastPlotTime >= plotInterval) {
      lastPlotTime = now;
      updateReadout(scaled, scaling);
      if (chart) chart.addReading(scaled);
      updateStats(channelStats.map(s => s.getStats()), scaling);
      appendLog(scaling.map((s, i) => `${s.label}=${scaled[i].toFixed(4)} ${s.unit}`).join('  '));
    }
  });

  conn.addEventListener('info', (e) => {
    const { device, product } = e.detail;
    updateDeviceInfo(device, product);
    appendLog(`Device: ${product} (${device})`);
    showToast(`Device: ${product}`, 'info');
  });

  conn.addEventListener('configured', (e) => {
    const { channels, rate, range } = e.detail;
    appendLog(`Configured: channels=${JSON.stringify(channels)} rate=${rate} range=±${range}V`);
    showToast('DAQ configured', 'success');
  });

  conn.addEventListener('log', (e) => appendLog(e.detail.message));
  conn.addEventListener('error', (e) => {
    appendLog('ERROR: ' + e.detail.message);
    showToast(e.detail.message, 'error', 6000);
  });
}

// ── Toolbar Buttons ────────────────────────────────────────
function wireToolbar() {
  document.getElementById('connectWs')?.addEventListener('click', async () => {
    const url = document.getElementById('wsUrl')?.value || undefined;
    try { await conn.connectWebSocket(url); } catch (_) {}
  });

  document.getElementById('disconnect')?.addEventListener('click', async () => {
    try { await conn.send({ cmd: 'stop' }); } catch (_) {}
    conn.disconnect();
  });

  // Measurement
  document.getElementById('startMeasure')?.addEventListener('click', startMeasurement);
  document.getElementById('stopMeasure')?.addEventListener('click', stopMeasurement);

  // Recording
  document.getElementById('startRecord')?.addEventListener('click', () => {
    recorder.start(scaling);
    setRecordingState(true);
    setScalingLocked(true);
    appendLog('Recording started');
    showToast('Recording started', 'info');
  });

  document.getElementById('stopRecord')?.addEventListener('click', () => {
    recorder.stop();
    setRecordingState(false);
    setScalingLocked(false);
    if (recorder.download()) {
      const msg = 'Recording saved (' + recorder.count + ' readings)';
      appendLog(msg);
      showToast(msg, 'success');
    } else {
      appendLog('No data recorded');
      showToast('No data recorded', 'error');
    }
  });

  // Demo
  document.getElementById('demo')?.addEventListener('click', toggleDemo);
}

// ── Rate Helpers ───────────────────────────────────────────
function getSampleIntervalMs() {
  const hz = parseFloat(document.getElementById('sampleRate')?.value) || 1;
  return Math.round(1000 / hz);
}

function getPlotIntervalMs() {
  const hz = parseFloat(document.getElementById('plotRate')?.value) || 1;
  return Math.round(1000 / hz);
}

// ── Measurement ────────────────────────────────────────────
function startMeasurement() {
  if (measurementInterval) return;
  const intervalMs = getSampleIntervalMs();
  const sampleHz = parseFloat(document.getElementById('sampleRate')?.value) || 1;
  const plotHz = parseFloat(document.getElementById('plotRate')?.value) || 1;
  const before = lastReadingTime;
  lastPlotTime = 0;
  // Send initial read immediately, then at interval
  conn.send({ cmd: 'read' });
  measurementInterval = setInterval(() => conn.send({ cmd: 'read' }), intervalMs);
  setMeasurementState(true);
  appendLog(`Measurement started (sample ${sampleHz} Hz, plot ${plotHz} Hz)`);
  showToast(`Sampling at ${sampleHz} Hz, plotting at ${plotHz} Hz`, 'info');

  measurementTimeout = setTimeout(() => {
    if (measurementInterval && lastReadingTime === before) {
      showToast('No response from bridge \u2014 is bridge.py running?', 'error', 6000);
      appendLog('WARNING: No readings received from bridge');
    }
  }, 3000);
}

function stopMeasurement() {
  if (!measurementInterval) return;
  clearInterval(measurementInterval);
  clearTimeout(measurementTimeout);
  measurementInterval = null;
  measurementTimeout = null;
  setMeasurementState(false);
  appendLog('Measurement stopped');
}

// ── Scaling Panel ──────────────────────────────────────────
function setScalingLocked(locked) {
  for (let i = 0; i < 4; i++) {
    const ch = i + 1;
    for (const field of ['Label', 'Unit', 'Slope', 'Offset']) {
      const el = document.getElementById(`scalingCH${ch}${field}`);
      if (el) el.disabled = locked;
    }
  }
  const notice = document.getElementById('scalingLockedNotice');
  if (notice) notice.style.display = locked ? 'block' : 'none';
}

function wireScaling() {
  for (let i = 0; i < 4; i++) {
    const ch = i + 1;
    const fields = ['Label', 'Unit', 'Slope', 'Offset'];
    for (const field of fields) {
      const el = document.getElementById(`scalingCH${ch}${field}`);
      if (el) {
        // Set initial values from loaded scaling
        if (field === 'Label') el.value = scaling[i].label;
        else if (field === 'Unit') el.value = scaling[i].unit;
        else if (field === 'Slope') el.value = scaling[i].slope;
        else if (field === 'Offset') el.value = scaling[i].offset;

        el.addEventListener('change', () => onScalingChange());
      }
    }
  }
}

function onScalingChange() {
  for (let i = 0; i < 4; i++) {
    const ch = i + 1;
    const label = document.getElementById(`scalingCH${ch}Label`)?.value || scaling[i].label;
    const unit = document.getElementById(`scalingCH${ch}Unit`)?.value || scaling[i].unit;
    const slope = parseFloat(document.getElementById(`scalingCH${ch}Slope`)?.value);
    const offset = parseFloat(document.getElementById(`scalingCH${ch}Offset`)?.value);
    scaling[i] = {
      label,
      unit,
      slope: isNaN(slope) ? scaling[i].slope : slope,
      offset: isNaN(offset) ? scaling[i].offset : offset,
    };
  }
  saveScaling(scaling);
  // Update chart labels
  if (chart) chart.setLabels(scaling.map(s => s.label));
  appendLog('Scaling config updated');
}

// ── Chart Controls ─────────────────────────────────────────
function wireChart() {
  document.getElementById('timeRange')?.addEventListener('change', (e) => {
    chart.setTimeWindow(parseInt(e.target.value));
  });

  document.getElementById('yMin')?.addEventListener('change', () => {
    chart.setYRange(
      document.getElementById('yMin').value,
      document.getElementById('yMax').value,
    );
  });

  document.getElementById('yMax')?.addEventListener('change', () => {
    chart.setYRange(
      document.getElementById('yMin').value,
      document.getElementById('yMax').value,
    );
  });

  document.getElementById('resetZoom')?.addEventListener('click', () => {
    chart.resetZoom();
    document.getElementById('yMin').value = '';
    document.getElementById('yMax').value = '';
  });

  document.getElementById('clearChart')?.addEventListener('click', () => {
    chart.clear();
    for (const s of channelStats) s.reset();
    updateStats(channelStats.map(s => s.getStats()), scaling);
  });
}

// ── Demo Mode ──────────────────────────────────────────────
function toggleDemo() {
  const btn = document.getElementById('demo');
  if (demoInterval) {
    stopDemo();
  } else {
    startDemo();
    if (btn) { btn.textContent = 'Stop Demo'; btn.classList.add('active'); }
  }
}

function startDemo() {
  demoState = {
    bases: [1.5, -0.3, 4.2, 0.01],
    step: 0,
  };
  const intervalMs = getSampleIntervalMs();
  const sampleHz = parseFloat(document.getElementById('sampleRate')?.value) || 1;
  const plotHz = parseFloat(document.getElementById('plotRate')?.value) || 1;
  lastPlotTime = 0;

  setConnectionState(true);
  showToast('Demo mode \u2014 generating fake voltage data', 'info');
  appendLog(`Demo started (sample ${sampleHz} Hz, plot ${plotHz} Hz)`);

  demoInterval = setInterval(() => {
    demoState.step++;
    const rawChannels = demoState.bases.map((base, i) => {
      const drift = 0.5 * Math.sin(demoState.step / (40 + i * 15) * Math.PI * 2);
      const noise = ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 0.02;
      return base + drift + noise;
    });

    const now = Date.now();
    const scaled = applyScaling(rawChannels, scaling);

    // Always: stats + recorder
    for (let i = 0; i < 4; i++) {
      channelStats[i].addValue(scaled[i]);
    }
    recorder.addReading(scaled);

    // Throttled: chart, readout, stats display, log
    const plotInterval = getPlotIntervalMs();
    if (now - lastPlotTime >= plotInterval) {
      lastPlotTime = now;
      updateReadout(scaled, scaling);
      if (chart) chart.addReading(scaled);
      updateStats(channelStats.map(s => s.getStats()), scaling);
      appendLog(scaling.map((s, i) => `${s.label}=${scaled[i].toFixed(4)} ${s.unit}`).join('  '));
    }
  }, intervalMs);
}

function stopDemo() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
    demoState = null;
  }
  stopMeasurement();
  setConnectionState(false);
  const btn = document.getElementById('demo');
  if (btn) { btn.textContent = 'Demo'; btn.classList.remove('active'); }
  appendLog('Demo stopped');
  showToast('Demo stopped', 'info');
}
