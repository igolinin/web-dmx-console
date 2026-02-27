/**
 * Per-universe DMX channel state buffer.
 * Each universe holds 512 channel values (0–255).
 */

export const DMX_CHANNELS = 512;

export class UniverseBuffer {
  private buffers = new Map<number, Uint8Array>();

  /** Get (or lazily create) the 512-byte buffer for a port-address. */
  get(portAddress: number): Uint8Array {
    let buf = this.buffers.get(portAddress);
    if (!buf) {
      buf = new Uint8Array(DMX_CHANNELS);
      this.buffers.set(portAddress, buf);
    }
    return buf;
  }

  /** Set a single channel (1-indexed, 1–512) in a universe. */
  setChannel(portAddress: number, channel: number, value: number): void {
    if (channel < 1 || channel > DMX_CHANNELS) return;
    const buf = this.get(portAddress);
    buf[channel - 1] = Math.max(0, Math.min(255, Math.round(value)));
  }

  /** Set a range of channels starting at `startChannel` (1-indexed). */
  setChannels(portAddress: number, startChannel: number, values: number[]): void {
    const buf = this.get(portAddress);
    for (let i = 0; i < values.length; i++) {
      const ch = startChannel - 1 + i;
      if (ch < 0 || ch >= DMX_CHANNELS) continue;
      buf[ch] = Math.max(0, Math.min(255, Math.round(values[i] ?? 0)));
    }
  }

  /** Fill all 512 channels of a universe with a value. */
  fill(portAddress: number, value: number): void {
    this.get(portAddress).fill(Math.max(0, Math.min(255, Math.round(value))));
  }

  /** Return all active port-addresses. */
  activeUniverses(): number[] {
    return [...this.buffers.keys()];
  }

  /** Remove a universe buffer. */
  remove(portAddress: number): void {
    this.buffers.delete(portAddress);
  }
}
