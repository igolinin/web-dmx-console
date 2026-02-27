import { describe, it, expect } from 'vitest';
import { buildArtDmxPacket, decomposePortAddress } from '../src/artnet/sender.js';
import { UniverseBuffer } from '../src/artnet/universe.js';

describe('decomposePortAddress', () => {
  it('decomposes address 0 to net=0 subnet=0 universe=0', () => {
    expect(decomposePortAddress(0)).toEqual({ net: 0, subnet: 0, universe: 0 });
  });

  it('decomposes address 1 to universe=1', () => {
    expect(decomposePortAddress(1)).toEqual({ net: 0, subnet: 0, universe: 1 });
  });

  it('decomposes address 16 to subnet=1 universe=0', () => {
    expect(decomposePortAddress(16)).toEqual({ net: 0, subnet: 1, universe: 0 });
  });

  it('decomposes address 256 to net=1 subnet=0 universe=0', () => {
    expect(decomposePortAddress(256)).toEqual({ net: 1, subnet: 0, universe: 0 });
  });
});

describe('buildArtDmxPacket', () => {
  it('starts with "Art-Net\\0" magic bytes', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(512));
    expect(pkt.subarray(0, 8).toString('ascii')).toBe('Art-Net\0');
  });

  it('has OpCode 0x5000 at bytes 8–9 (little-endian)', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(512));
    expect(pkt.readUInt16LE(8)).toBe(0x5000);
  });

  it('has protocol version 14 at bytes 10–11 (big-endian)', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(512));
    expect(pkt.readUInt16BE(10)).toBe(14);
  });

  it('encodes universe 3 correctly in SubUni byte', () => {
    // portAddress = 3 → net=0, subnet=0, universe=3 → SubUni=3
    const pkt = buildArtDmxPacket(3, new Uint8Array(512));
    expect(pkt[14]).toBe(3);
    expect(pkt[15]).toBe(0); // net=0
  });

  it('encodes subnet 2, universe 5 correctly', () => {
    // portAddress = (0<<8)|(2<<4)|5 = 37
    const pkt = buildArtDmxPacket(37, new Uint8Array(512));
    expect(pkt[14]).toBe((2 << 4) | 5); // 0x25 = 37
    expect(pkt[15]).toBe(0);
  });

  it('encodes net 1 correctly', () => {
    // portAddress = 256 → net=1, subnet=0, universe=0
    const pkt = buildArtDmxPacket(256, new Uint8Array(512));
    expect(pkt[15]).toBe(1);
  });

  it('has length 512 for full buffer (big-endian at bytes 16–17)', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(512));
    expect(pkt.readUInt16BE(16)).toBe(512);
  });

  it('rounds up odd-length data to even', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(3));
    expect(pkt.readUInt16BE(16)).toBe(4);
  });

  it('uses minimum length of 2 for empty data', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(0));
    expect(pkt.readUInt16BE(16)).toBe(2);
  });

  it('copies DMX data correctly starting at byte 18', () => {
    const dmx = new Uint8Array(512);
    dmx[0] = 255;
    dmx[1] = 128;
    dmx[511] = 42;
    const pkt = buildArtDmxPacket(0, dmx);
    expect(pkt[18]).toBe(255);
    expect(pkt[19]).toBe(128);
    expect(pkt[18 + 511]).toBe(42);
  });

  it('total packet length is 18 + data length', () => {
    const pkt = buildArtDmxPacket(0, new Uint8Array(512));
    expect(pkt.length).toBe(530);
  });
});

describe('UniverseBuffer', () => {
  it('initialises with all zeros', () => {
    const ub = new UniverseBuffer();
    const buf = ub.get(0);
    expect(buf.every((v) => v === 0)).toBe(true);
    expect(buf.length).toBe(512);
  });

  it('returns same buffer instance on repeated get', () => {
    const ub = new UniverseBuffer();
    expect(ub.get(0)).toBe(ub.get(0));
  });

  it('setChannel writes correct index (1-indexed)', () => {
    const ub = new UniverseBuffer();
    ub.setChannel(0, 1, 200);
    expect(ub.get(0)[0]).toBe(200);
    ub.setChannel(0, 512, 100);
    expect(ub.get(0)[511]).toBe(100);
  });

  it('setChannel clamps to 0–255', () => {
    const ub = new UniverseBuffer();
    ub.setChannel(0, 1, 300);
    expect(ub.get(0)[0]).toBe(255);
    ub.setChannel(0, 1, -10);
    expect(ub.get(0)[0]).toBe(0);
  });

  it('setChannel ignores out-of-range channel numbers', () => {
    const ub = new UniverseBuffer();
    ub.setChannel(0, 0, 255); // below 1
    ub.setChannel(0, 513, 255); // above 512
    expect(ub.get(0).every((v) => v === 0)).toBe(true);
  });

  it('setChannels writes a range', () => {
    const ub = new UniverseBuffer();
    ub.setChannels(0, 10, [10, 20, 30]);
    expect(ub.get(0)[9]).toBe(10);
    expect(ub.get(0)[10]).toBe(20);
    expect(ub.get(0)[11]).toBe(30);
  });

  it('fill sets all 512 channels', () => {
    const ub = new UniverseBuffer();
    ub.fill(0, 127);
    expect(ub.get(0).every((v) => v === 127)).toBe(true);
  });

  it('activeUniverses returns all initialised universes', () => {
    const ub = new UniverseBuffer();
    ub.get(0);
    ub.get(5);
    ub.get(16);
    expect(ub.activeUniverses().sort((a, b) => a - b)).toEqual([0, 5, 16]);
  });

  it('remove deletes a universe buffer', () => {
    const ub = new UniverseBuffer();
    ub.get(0);
    ub.remove(0);
    expect(ub.activeUniverses()).toEqual([]);
  });
});
