/**
 * scaling.js — Per-channel linear scaling with localStorage persistence.
 *
 * Each channel has: { label, unit, slope, offset }
 * Scaled value = slope * voltage + offset
 */

const STORAGE_KEY = 'cdaq9181-scaling';

const DEFAULTS = [
  { label: 'CH1', unit: 'V', slope: 1, offset: 0 },
  { label: 'CH2', unit: 'V', slope: 1, offset: 0 },
  { label: 'CH3', unit: 'V', slope: 1, offset: 0 },
  { label: 'CH4', unit: 'V', slope: 1, offset: 0 },
];

/**
 * Load scaling config from localStorage, falling back to defaults.
 * @returns {Array<{label: string, unit: string, slope: number, offset: number}>}
 */
export function loadScaling() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 4) {
        return parsed.map((ch, i) => ({
          label: ch.label || DEFAULTS[i].label,
          unit: ch.unit || DEFAULTS[i].unit,
          slope: typeof ch.slope === 'number' ? ch.slope : DEFAULTS[i].slope,
          offset: typeof ch.offset === 'number' ? ch.offset : DEFAULTS[i].offset,
        }));
      }
    }
  } catch (_) {}
  return DEFAULTS.map(d => ({ ...d }));
}

/**
 * Save scaling config to localStorage.
 * @param {Array<{label: string, unit: string, slope: number, offset: number}>} channels
 */
export function saveScaling(channels) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
}

/**
 * Apply linear scaling to raw voltage readings.
 * @param {number[]} voltages — array of 4 raw voltage values
 * @param {Array<{slope: number, offset: number}>} scaling — per-channel config
 * @returns {number[]} — array of 4 scaled values
 */
export function applyScaling(voltages, scaling) {
  return voltages.map((v, i) => {
    const s = scaling[i];
    return s.slope * v + s.offset;
  });
}
