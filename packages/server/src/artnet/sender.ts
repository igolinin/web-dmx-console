/**
 * Art-Net ArtDmx packet builder and UDP sender.
 *
 * Protocol reference: Art-Net 4 specification (https://art-net.org.uk)
 *
 * Packet layout (ArtDmx, OpCode 0x5000):
 *   Bytes  0–7  : "Art-Net\0"
 *   Bytes  8–9  : OpCode 0x5000 little-endian
 *   Bytes 10–11 : Protocol version 14, big-endian
 *   Byte  12    : Sequence (0 = disabled)
 *   Byte  13    : Physical (0)
 *   Byte  14    : SubUni = (subnet << 4) | universe
 *   Byte  15    : Net (7-bit)
 *   Bytes 16–17 : Length big-endian (even number 2–512)
 *   Bytes 18+   : DMX512 data
 */

import dgram from 'node:dgram';

export const ART_NET_PORT = 6454;

/** Decompose a 15-bit Art-Net port-address into net / subnet / universe. */
export function decomposePortAddress(portAddress: number): {
  net: number;
  subnet: number;
  universe: number;
} {
  return {
    net: (portAddress >> 8) & 0x7f,
    subnet: (portAddress >> 4) & 0x0f,
    universe: portAddress & 0x0f,
  };
}

/** Build an ArtDmx packet for the given port-address and 512-byte DMX buffer. */
export function buildArtDmxPacket(portAddress: number, dmxData: Uint8Array): Buffer {
  const { net, subnet, universe } = decomposePortAddress(portAddress);

  // Length must be even and between 2–512
  let length = dmxData.length;
  if (length < 2) length = 2;
  if (length > 512) length = 512;
  if (length % 2 !== 0) length += 1;

  const packet = Buffer.alloc(18 + length, 0);

  // ID: "Art-Net\0"
  Buffer.from('Art-Net\0').copy(packet, 0);

  // OpCode 0x5000 little-endian
  packet.writeUInt16LE(0x5000, 8);

  // Protocol version 14, big-endian
  packet.writeUInt16BE(14, 10);

  // Sequence (0 = disabled), Physical (0)
  packet[12] = 0;
  packet[13] = 0;

  // SubUni and Net
  packet[14] = ((subnet & 0x0f) << 4) | (universe & 0x0f);
  packet[15] = net & 0x7f;

  // Length big-endian
  packet.writeUInt16BE(length, 16);

  // DMX data
  Buffer.from(dmxData.subarray(0, length)).copy(packet, 18);

  return packet;
}

export interface SenderOptions {
  host: string;
  broadcast?: boolean;
}

export class ArtNetSender {
  private socket: dgram.Socket;
  private host: string;
  private closed = false;

  constructor(options: SenderOptions) {
    this.host = options.host;
    this.socket = dgram.createSocket('udp4');
    this.socket.bind(() => {
      if (options.broadcast) {
        this.socket.setBroadcast(true);
      }
    });
  }

  send(portAddress: number, dmxData: Uint8Array): void {
    if (this.closed) return;
    const packet = buildArtDmxPacket(portAddress, dmxData);
    this.socket.send(packet, ART_NET_PORT, this.host);
  }

  close(): void {
    this.closed = true;
    this.socket.close();
  }
}
