// Lightweight Protobuf reader tailored for ONNX (proto3) binary format.
// Supports the wire types used in ONNX models: varint(0), 64-bit(1), length-delimited(2), 32-bit(5).

import { WireType } from './types';

export interface TagInfo {
  fieldNumber: number;
  wireType: WireType;
}

export class ProtobuffReader {
  private readonly buf: Uint8Array;
  private pos = 0;
  private readonly dv: DataView;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  eof(): boolean {
    return this.pos >= this.buf.length;
  }
  tell(): number {
    return this.pos;
  }
  seek(p: number): void {
    this.pos = p;
  }

  tag(): TagInfo | null {
    if (this.eof()) return null;
    const key = this.varint();
    return { fieldNumber: key >>> 3, wireType: key & 0x7 };
  }

  varint(): number {
    let x = 0;
    let s = 0;
    while (true) {
      if (this.pos >= this.buf.length) throw new Error('Truncated varint');
      const b = this.buf[this.pos++]!; // safe due to prior bounds check
      x |= (b & 0x7f) << s;
      if ((b & 0x80) === 0) break;
      s += 7;
      if (s > 53) throw new Error('Varint too big');
    }
    return x;
  }

  // int64/uint64 may exceed 53 bits – we only need up to 53 for dims; when larger, store as number (lossy) or BigInt via varintBig().
  varintBig(): bigint {
    let x = 0n;
    let s = 0n;
    while (true) {
      if (this.pos >= this.buf.length) throw new Error('Truncated varint');
      const b = this.buf[this.pos++]!; // safe due to prior bounds check
      x |= BigInt(b & 0x7f) << s;
      if ((b & 0x80) === 0) break;
      s += 7n;
      if (s > 70n) throw new Error('Varint too big');
    }
    return x;
  }

  bytes(): Uint8Array {
    const len = this.varint();
    const start = this.pos;
    const end = start + len;
    if (end > this.buf.length) {
      throw new Error('Truncated length-delimited field');
    }
    this.pos = end;
    return this.buf.subarray(start, end);
  }

  string(): string {
    return new TextDecoder().decode(this.bytes());
  }

  fixed32(): number {
    if (this.pos + 4 > this.buf.length) throw new Error('Truncated fixed32');
    const v = this.dv.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  fixed64(): bigint {
    if (this.pos + 8 > this.buf.length) throw new Error('Truncated fixed64');
    const lo = this.dv.getUint32(this.pos, true);
    const hi = this.dv.getUint32(this.pos + 4, true);
    this.pos += 8;
    return (BigInt(hi) << 32n) | BigInt(lo);
  }

  skip(wt: WireType): void {
    switch (wt) {
      case WireType.Varint:
        this.varint();
        return;
      case WireType.Bit64:
        this.seek(this.pos + 8);
        return;
      case WireType.LengthDelimited: {
        const len = this.varint();
        this.seek(this.pos + len);
        return;
      }
      case WireType.Bit32:
        this.seek(this.pos + 4);
        return;
      default:
        throw new Error('Unsupported wire type: ' + wt);
    }
  }
}
