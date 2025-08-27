//
export interface InferenceSession {
  loadModel(modelPath: string, options: SessionOptions): Promise<void>;
  loadModel(
    buffer: ArrayBuffer,
    byteOffset: number,
    byteLength: number,
    options: SessionOptions,
  ): Promise<void>;

  readonly inputMetadata: ValueMetadata[];
  readonly outputMetadata: ValueMetadata[];
}

// lightweight types used by the session handler. The concrete implementation
// below exposes a `binding` object with `InferenceSession` so other modules
// can do `new binding.InferenceSession()` (as `sessionHandler.ts` expects).

export interface SessionOptions {
  enableProfiling?: boolean;
  // other options are intentionally permissive
  [k: string]: unknown;
}

// export interface RunOptions {
//   // placeholder for run options
//   [k: string]: unknown;
// }

export interface ValueMetadata {
  name: string;
  isTensor: boolean;
  // numeric data type id (binding-specific) when isTensor === true
  type?: number;
  // concrete dimensions (non-negative numbers) or symbolic names (strings)
  shape?: Array<number | string>;
  // only used when parsing symbolic dims from a model
  symbolicDimensions?: string[];
}
