import type { ProtobuffReader } from '../protobuf';

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
