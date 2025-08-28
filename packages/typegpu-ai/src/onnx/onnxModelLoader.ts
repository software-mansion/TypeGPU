// Complete ONNX loader (no external onnx/protobuf libs) that parses the
// model protobuf and exposes graph, nodes and tensor buffers.

import { decodeModel } from './decode.ts';
import { PbReader, type WireType } from './protobuf.ts';
import {
  type Tensor, TensorDataType, type ValueInfo, type Node, type Graph,
  type OnnxModel, type DecodedModel, type OnnxLoadOptions, defaultLoadOptions,
} from './types.ts';
import { bfloat16ToFloat32, fetchOrRead, float16ToFloat32 } from './utils.ts';

// ------------------ Public Loader API --------------------
export class OnnxModelLoader {
  static async fromPath(path: string, opts?: OnnxLoadOptions): Promise<OnnxModelLoader> {
    const buf = await fetchOrRead(path);
    return OnnxModelLoader.fromBuffer(buf, opts);
  }

  static fromBuffer(buffer: Uint8Array, opts?: OnnxLoadOptions): OnnxModelLoader {
    const loader = new OnnxModelLoader();
    loader.#decode(buffer, opts);
    return loader;
  }

  // Backwards-compatible constructor taking path or buffer (async readiness via ready promise)
  public readonly ready: Promise<void>;
  private constructor(pathOrBuffer?: string | Uint8Array, opts?: OnnxLoadOptions) {
    this.ready = (async () => {
      if (pathOrBuffer !== undefined) {
        const buf = typeof pathOrBuffer === 'string' ? await fetchOrRead(pathOrBuffer) : pathOrBuffer;
        this.#decode(buf, opts);
      }
    })();
  }

  // Factory helper for convenience when using `new` is desired.
  static async load(pathOrBuffer: string | Uint8Array, opts?: OnnxLoadOptions): Promise<OnnxModelLoader> {
    const inst = new OnnxModelLoader(pathOrBuffer, opts);
    await inst.ready; return inst;
  }

  // Decoded model + tensor map
  #model?: OnnxModel;
  #buffer?: Uint8Array;

  get model(): OnnxModel { if (!this.#model) throw new Error('Model not loaded yet'); return this.#model; }
  get buffer(): Uint8Array { if (!this.#buffer) throw new Error('Model not loaded yet'); return this.#buffer; }

  listInitializers(): string[] { return [...this.model.tensorMap.keys()]; }
  getTensor(name: string): Tensor | undefined { return this.model.tensorMap.get(name); }
  getInputNames(): string[] { return this.model.graph.inputs.map(i => i.name); }
  getOutputNames(): string[] { return this.model.graph.outputs.map(o => o.name); }
  getNodes(): Node[] { return this.model.graph.nodes; }

  // Internal decode
  #decode(buffer: Uint8Array, opts?: OnnxLoadOptions): void {
    const options = { ...defaultLoadOptions, ...(opts || {}) };
    const { model } = decodeModel(buffer, options);
    this.#model = model;
    this.#buffer = buffer;
  }
}

// --------------- Decoding Implementation -----------------

// interface DecodeCtx { options: Required<OnnxLoadOptions>; }




export function readDoubleFromFixed64(r: PbReader): number {
  const bi = r.fixed64();
  const buf = new ArrayBuffer(8); const dv = new DataView(buf);
  dv.setBigUint64(0, bi, true); return dv.getFloat64(0, true);
}

export function decodeRawData(raw: Uint8Array, dt: TensorDataType, elementCount: number): any {
  const off = raw.byteOffset; const buf = raw.buffer; const len = raw.byteLength;
  type AnyTypedArray = Float32Array | Float64Array | Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | BigInt64Array | BigUint64Array;
  const construct = <T extends AnyTypedArray>(Ctor: { new(buffer: ArrayBufferLike, byteOffset: number, length: number): T; BYTES_PER_ELEMENT: number }, count = elementCount): T => {
    const neededBytes = Ctor.BYTES_PER_ELEMENT * count;
    if (neededBytes > len) {
      // Clamp count to available bytes to avoid RangeError; model may be malformed.
      count = Math.floor(len / Ctor.BYTES_PER_ELEMENT);
    }
    if (off % Ctor.BYTES_PER_ELEMENT === 0) {
      try {
        return new Ctor(buf, off, count);
      } catch {
        // fallthrough to copy below
      }
    }
    // Unaligned or failed: copy to aligned buffer
    const copy = raw.slice(0, neededBytes);
    return new Ctor(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / Ctor.BYTES_PER_ELEMENT));
  };

  switch (dt) {
    case TensorDataType.FLOAT: return construct(Float32Array);
    case TensorDataType.DOUBLE: return construct(Float64Array);
    case TensorDataType.INT32: return construct(Int32Array);
    case TensorDataType.INT64: return construct(BigInt64Array as any);
    case TensorDataType.UINT8: return raw; // already byte-aligned
    case TensorDataType.INT8: return construct(Int8Array);
    case TensorDataType.UINT16: return construct(Uint16Array);
    case TensorDataType.INT16: return construct(Int16Array);
    case TensorDataType.UINT32: return construct(Uint32Array);
    case TensorDataType.UINT64: return construct(BigUint64Array as any);
    case TensorDataType.FLOAT16: return float16ToFloat32(construct(Uint16Array));
    case TensorDataType.BFLOAT16: return bfloat16ToFloat32(construct(Uint16Array));
    default: return raw; // unsupported types remain raw
  }
}





// TypedBinary