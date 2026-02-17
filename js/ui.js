/**
 * UI helpers — button states, readout display, stats, toasts, log.
 * Theme is handled by inline script in index.html (no module dependency).
 */

export function setConnectionState(connected) {
  const dot = document.getElementById('statusDot');
  const connectWsBtn = document.getElementById('connectWs');
  const disconnectBtn = document.getElementById('disconnect');
  const wsUrlInput = document.getElementById('wsUrl');

  if (dot) dot.classList.toggle('connected', connected);
  if (connectWsBtn) connectWsBtn.disabled = connected;
  if (disconnectBtn) disconnectBtn.disabled = !connected;
  if (wsUrlInput) wsUrlInput.disabled = connected;

  const cmdBtns = document.querySelectorAll('[data-requires-connection]');
  cmdBtns.forEach(btn => btn.disabled = !connected);
}

export function setMeasurementState(active) {
  const startBtn = document.getElementById('startMeasure');
  const stopBtn = document.getElementById('stopMeasure');
  if (startBtn) {
    startBtn.disabled = active;
    startBtn.classList.toggle('active', false);
  }
  if (stopBtn) {
    stopBtn.disabled = !active;
    stopBtn.classList.toggle('active', active);
  }
}

export function setRecordingState(active) {
  const startBtn = document.getElementById('startRecord');
  const stopBtn = document.getElementById('stopRecord');
  if (startBtn) {
    startBtn.disabled = active;
    startBtn.classList.toggle('active', false);
  }
  if (stopBtn) {
    stopBtn.disabled = !active;
    stopBtn.classList.toggle('active', active);
  }
}

/**
 * Update the 4-channel readout display with scaled values.
 * @param {number[]} channels — array of 4 scaled values
 * @param {Array<{label: string, unit: string}>} scaling — per-channel config
 */
export function updateReadout(channels, scaling) {
  for (let i = 0; i < 4; i++) {
    const valEl = document.getElementById(`readoutCH${i + 1}`);
    const labelEl = document.getElementById(`labelCH${i + 1}`);
    const unitEl = document.getElementById(`unitCH${i + 1}`);
    if (valEl) {
      valEl.textContent = channels[i] !== null && channels[i] !== undefined
        ? channels[i].toFixed(4)
        : '---';
    }
    if (labelEl && scaling) labelEl.textContent = scaling[i].label;
    if (unitEl && scaling) unitEl.textContent = scaling[i].unit;
  }
  const timeEl = document.getElementById('readoutTime');
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
}

/**
 * Update stats display for all 4 channels.
 * @param {Array<{min,max,mean,stddev,count}>} channelStats
 * @param {Array<{label: string}>} scaling
 */
export function updateStats(channelStats, scaling) {
  const fmt = (v) => v === null ? '---' : v.toFixed(4);
  const countEl = document.getElementById('statCount');
  if (countEl) countEl.textContent = channelStats[0]?.count ?? 0;

  for (let i = 0; i < 4; i++) {
    const s = channelStats[i];
    if (!s) continue;
    const prefix = `statCH${i + 1}`;
    const set = (suffix, v) => {
      const el = document.getElementById(prefix + suffix);
      if (el) el.textContent = fmt(v);
    };
    set('Min', s.min);
    set('Max', s.max);
    set('Mean', s.mean);

    // Update stat group header labels
    const headerEl = document.getElementById(`statHeaderCH${i + 1}`);
    if (headerEl && scaling) headerEl.textContent = scaling[i].label;
  }
}

/**
 * Display device info from bridge.
 */
export function updateDeviceInfo(device, product) {
  const el = document.getElementById('deviceInfo');
  if (el) el.textContent = product ? `${product} (${device})` : device;
}

const MAX_LOG_LINES = 500;
let _logLineCount = 0;

export function appendLog(message) {
  const el = document.getElementById('logOutput');
  if (!el) return;
  const now = new Date().toLocaleTimeString();
  el.textContent += `[${now}] ${message}\n`;
  _logLineCount++;
  if (_logLineCount > MAX_LOG_LINES) {
    // Drop the oldest half of lines in one cut
    const lines = el.textContent.split('\n');
    const half = Math.floor(lines.length / 2);
    el.textContent = lines.slice(half).join('\n');
    _logLineCount = lines.length - half;
  }
  el.scrollTop = el.scrollHeight;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'} type
 * @param {number} duration ms before auto-dismiss
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  const dismiss = () => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove());
  };
  el.addEventListener('click', dismiss);
  if (duration > 0) setTimeout(dismiss, duration);
}
