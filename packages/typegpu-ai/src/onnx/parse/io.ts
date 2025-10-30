import { ProtobuffReader } from '../protobuf';
import { WireType } from '../types';
import { bitsToFloat32, normalizeInt64 } from './convert';

export async function fetchOrRead(path: string): Promise<Uint8Array> {
  // Node vs browser
  if (typeof process !== 'undefined' && (process as any).versions?.node) {
    const fs = await import('fs');
    const data = fs.readFileSync(path);
    return data instanceof Uint8Array ? data : new Uint8Array(data as any);
  }
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to fetch ONNX model: ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

export function readFloatFromVarint(r: ProtobuffReader): number { // not actually varint encoded; placeholder (ONNX uses length-delimited repeated packed?). Simplify.
  return Number(r.varint());
}

export function readDoubleFromFixed64(r: ProtobuffReader): number {
  const bi = r.fixed64();
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setBigUint64(0, bi, true);
  return dv.getFloat64(0, true);
}

export function readFloat32Values(
  r: ProtobuffReader,
  wireType: WireType,
): number[] {
  if (wireType === WireType.LengthDelimited) {
    const data = r.bytes();
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const result: number[] = [];
    for (let offset = 0; offset + 4 <= data.byteLength; offset += 4) {
      result.push(dv.getFloat32(offset, true));
    }
    return result;
  }
  if (wireType === WireType.Bit32) {
    return [bitsToFloat32(r.fixed32())];
  }
  return [];
}

export function readInt64Values(
  r: ProtobuffReader,
  wireType: WireType,
): (number | bigint)[] {
  if (wireType === WireType.LengthDelimited) {
    const data = r.bytes();
    const rr = new ProtobuffReader(data);
    const values: (number | bigint)[] = [];
    while (!rr.eof()) {
      values.push(normalizeInt64(rr.varintBig()));
    }
    return values;
  }
  if (wireType === WireType.Varint) {
    return [normalizeInt64(r.varintBig())];
  }
  return [];
}
