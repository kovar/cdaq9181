/**
 * Recorder — records timestamped 4-channel readings and exports as CSV.
 * Column headers use the current scaling labels and units.
 */
export class Recorder {
  #data = [];
  #recording = false;
  #scaling = null;

  get isRecording() {
    return this.#recording;
  }

  get count() {
    return this.#data.length;
  }

  /**
   * @param {Array<{label: string, unit: string}>} scaling — current scaling config for headers
   */
  start(scaling) {
    this.#data = [];
    this.#recording = true;
    this.#scaling = scaling;
  }

  stop() {
    this.#recording = false;
  }

  /**
   * @param {number[]} channels — array of 4 scaled values
   */
  addReading(channels) {
    if (!this.#recording) return;
    this.#data.push({
      timestamp: new Date().toISOString(),
      channels: [...channels],
    });
  }

  download() {
    if (this.#data.length === 0) return false;
    const s = this.#scaling || [
      { label: 'CH1', unit: 'V' },
      { label: 'CH2', unit: 'V' },
      { label: 'CH3', unit: 'V' },
      { label: 'CH4', unit: 'V' },
    ];
    const header = 'Timestamp,' + s.map(c => `${c.label}_${c.unit}`).join(',') + '\n';
    const rows = this.#data.map(r =>
      `${r.timestamp},${r.channels[0]},${r.channels[1]},${r.channels[2]},${r.channels[3]}`
    ).join('\n');
    const csv = header + rows + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:\-]/g, '').replace(/\..+/, '');
    a.download = `cdaq9181_reading_${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }
}
