import { bin } from 'typed-binary';
import { OnnxModel, TensorDataType } from './types';
import { PbReader } from './protobuf';

// Utility: map all tensors to friendly string for debugging
export function summarizeModel(m: OnnxModel): string {
  const lines: string[] = [];
  lines.push(`Model: inputs=${m.graph.inputs.length} outputs=${m.graph.outputs.length} inits=${m.graph.initializers.length}`);
  for (const t of m.graph.initializers) {
    lines.push(`  [init] ${t.name} ${dataTypeName(t.dataType)} [${t.dims.join(',')}] elements=${t.elementCount}`);
  }
  return lines.join('\n');
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


export function readFloatFromVarint(r: PbReader): number { // not actually varint encoded; placeholder (ONNX uses length-delimited repeated packed?). Simplify.
  return Number(r.varint());
}

export function float16ToFloat32(src: Uint16Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const h: number = src[i]!;
    const s = (h & 0x8000) >> 15;
    const e = (h & 0x7C00) >> 10;
    const f = h & 0x03FF;
    let val: number;
    if (e === 0) {
      val = (f / 0x400) * Math.pow(2, -14);
    } else if (e === 0x1f) {
      val = f ? Number.NaN : Number.POSITIVE_INFINITY;
    } else {
      val = (1 + f / 0x400) * Math.pow(2, e - 15);
    }
    out[i] = s ? -val : val;
  }
  return out;
}
export function bfloat16ToFloat32(src: Uint16Array): Float32Array {
  const out = new Float32Array(src.length);
  const u32 = new Uint32Array(out.buffer);
  for (let i = 0; i < src.length; i++) u32[i] = (src[i]! as number) << 16;
  return out;
}

export function elementSize(dt: TensorDataType): number | null {
  switch (dt) {
    case TensorDataType.FLOAT: return 4;
    case TensorDataType.DOUBLE: return 8;
    case TensorDataType.INT32: return 4;
    case TensorDataType.INT64: return 8;
    case TensorDataType.UINT8: return 1;
    case TensorDataType.INT8: return 1;
    case TensorDataType.UINT16: return 2;
    case TensorDataType.INT16: return 2;
    case TensorDataType.UINT32: return 4;
    case TensorDataType.UINT64: return 8;
    case TensorDataType.BOOL: return 1;
    case TensorDataType.FLOAT16: return 2;
    case TensorDataType.BFLOAT16: return 2;
    default: return null; // variable sized or unsupported
  }
}

export function dataTypeName(dt: TensorDataType): string {
  return TensorDataType[dt] ?? 'UNKNOWN';
}
