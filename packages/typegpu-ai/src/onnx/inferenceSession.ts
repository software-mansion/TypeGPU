// Minimal, self-contained binding implementation. It intentionally keeps
// dependencies to a minimum. If a real ONNX runtime is available at
// runtime, this file can be replaced or extended to call it instead.
import type { SessionOptions } from './utils.ts';

export interface ValueMetadata {
  name: string;
  isTensor: boolean;
  type?: number;
  shape?: number[];
  symbolicDimensions?: string[];
}

// ========================================================
// ======= CLASS IMPLEMENTATION BELOW ====================
// ========================================================

export class InferenceSessionClass {
  private _inputMetadata: ValueMetadata[] = [];
  private _outputMetadata: ValueMetadata[] = [];
  public _modelBuffer: Uint8Array | undefined; // TODO

  constructor() {
    // no-op constructor; model is loaded via loadModel
  }

  // load by path
  async loadModel(
    modelPathOrBuffer: string | Uint8Array,
    maybeOffsetOrOptions?: any,
    maybeLength?: any,
    maybeOptions?: any,
  ): Promise<void> {
    // Overloads:
    //  - loadModel(path: string, options)
    //  - loadModel(buffer: ArrayBuffer, byteOffset: number, byteLength: number, options)

    if (typeof modelPathOrBuffer === 'string') {
      const path: string = modelPathOrBuffer;
      const options: SessionOptions | undefined = maybeOffsetOrOptions;

      // Try Node fs first (when running under Node). If not available,
      // fallback to fetching the model (browser/wasm-hosted environments).
      let uint8: Uint8Array;
      try {
        // Detect Node by checking process.versions.node
        // Use dynamic import so bundlers don't include `fs` for browser builds.
        if (typeof process !== 'undefined' && (process as any).versions?.node) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const fs = await import('fs');
          const data = fs.readFileSync(path);
          uint8 = Uint8Array.from(data as Uint8Array);
        } else {
          // Browser / other host: use fetch
          const resp = await fetch(path);
          if (!resp.ok) throw new Error(`Failed to fetch model at ${path}: ${resp.status}`);
          const ab = await resp.arrayBuffer();
          uint8 = new Uint8Array(ab);
        }
      } catch (err) {
        throw new Error(`Failed to load model '${path}': ${(err as Error).message}`);
      }

      this._modelBuffer = uint8;
      // attempt to parse metadata; if parsing isn't implemented we leave
      // metadata empty which is a valid fallback for discovery code.
      this._parseModelBuffer(this._modelBuffer, options);
    } else if (
      modelPathOrBuffer instanceof ArrayBuffer ||
      ArrayBuffer.isView(modelPathOrBuffer)
    ) {
      const buffer = (modelPathOrBuffer instanceof ArrayBuffer)
        ? new Uint8Array(modelPathOrBuffer)
        : new Uint8Array(
          modelPathOrBuffer.buffer,
          maybeOffsetOrOptions || 0,
          maybeLength || 0,
        );
      const options: SessionOptions | undefined = maybeOptions;
      this._modelBuffer = buffer;
      this._parseModelBuffer(this._modelBuffer, options);
    } else {
      throw new Error('Unsupported argument to loadModel');
    }
  }

  // public readonly accessors used by sessionHandler.ts
  get inputMetadata(): ValueMetadata[] {
    return this._inputMetadata;
  }

  get outputMetadata(): ValueMetadata[] {
    return this._outputMetadata;
  }

  dispose(): void {
    // clear buffer and metadata
    this._modelBuffer = undefined;
    this._inputMetadata = [];
    this._outputMetadata = [];
  }

  // --- internal helpers ---
  private _parseModelBuffer(
    _buf: Uint8Array,
    _options?: SessionOptions,
  ): void {
    // NOTE: full ONNX parsing (protobuf) is intentionally out of scope for
    // this lightweight implementation. Implementations may attempt to
    // require a protobuf parser or onnxruntime bindings here to populate
    // realistic metadata. For now we conservatively set metadata arrays to
    // empty values so callers can handle models that don't need metadata.

    // Keep metadata empty by default. If future improvements are desired
    // we can try to dynamically import a parser here.
    this._inputMetadata = [];
    this._outputMetadata = [];
  }
}
