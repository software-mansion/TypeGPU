// Complete ONNX loader (no external onnx/protobuf libs) that parses the
// model protobuf and exposes graph, nodes and tensor buffers.

import { dataTypeName } from './decode/convert.ts';
import { decodeModel } from './decode/decode.ts';
import { fetchOrRead } from './decode/io.ts';
import type { ProtobuffReader } from './protobuf.ts';
import {
  defaultLoadOptions,
  type Node,
  type OnnxLoadOptions,
  type OnnxModel,
  type Tensor,
} from './types.ts';

export class OnnxLoader {
  static async fromPath(
    path: string,
    opts?: OnnxLoadOptions,
  ): Promise<OnnxLoader> {
    const buf = await fetchOrRead(path);
    return OnnxLoader.fromBuffer(buf, opts);
  }

  static fromBuffer(
    buffer: Uint8Array,
    opts?: OnnxLoadOptions,
  ): OnnxLoader {
    const loader = new OnnxLoader();
    loader.#decode(buffer, opts);
    return loader;
  }

  // Backwards-compatible constructor taking path or buffer (async readiness via ready promise)
  public readonly ready: Promise<void>;
  private constructor(
    pathOrBuffer?: string | Uint8Array,
    opts?: OnnxLoadOptions,
  ) {
    this.ready = (async () => {
      if (pathOrBuffer !== undefined) {
        const buf = typeof pathOrBuffer === 'string'
          ? await fetchOrRead(pathOrBuffer)
          : pathOrBuffer;
        this.#decode(buf, opts);
      }
    })();
  }

  // Factory helper for convenience when using `new` is desired.
  static async load(
    pathOrBuffer: string | Uint8Array,
    opts?: OnnxLoadOptions,
  ): Promise<OnnxLoader> {
    const inst = new OnnxLoader(pathOrBuffer, opts);
    await inst.ready;
    return inst;
  }

  // Decoded model + tensor map
  #model?: OnnxModel;
  #buffer?: Uint8Array;

  get model(): OnnxModel {
    if (!this.#model) throw new Error('Model not loaded yet');
    return this.#model;
  }
  get buffer(): Uint8Array {
    if (!this.#buffer) throw new Error('Model not loaded yet');
    return this.#buffer;
  }

  listInitializers(): string[] {
    return [...this.model.tensorMap.keys()];
  }
  getTensor(name: string): Tensor | undefined {
    return this.model.tensorMap.get(name);
  }
  getInputNames(): string[] {
    return this.model.graph.inputs.map((i) => i.name);
  }
  getOutputNames(): string[] {
    return this.model.graph.outputs.map((o) => o.name);
  }
  getNodes(): Node[] {
    return this.model.graph.nodes;
  }

  // Internal decode
  #decode(buffer: Uint8Array, opts?: OnnxLoadOptions): void {
    const options = { ...defaultLoadOptions, ...(opts || {}) };
    const { model } = decodeModel(buffer, options);
    this.#model = model;
    this.#buffer = buffer;
  }
}

// TypedBinary
export function summarizeModel(m: OnnxModel): string {
  const lines: string[] = [];
  lines.push(
    `Model: inputs=${m.graph.inputs.length} outputs=${m.graph.outputs.length} inits=${m.graph.initializers.length}`,
  );
  for (const t of m.graph.initializers) {
    lines.push(
      `  [init] ${t.name} ${dataTypeName(t.dataType)} [${
        t.dims.join(',')
      }] elements=${t.elementCount}`,
    );
  }
  return lines.join('\n');
}
