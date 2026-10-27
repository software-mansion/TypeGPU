import {
  $gpuRepr,
  $inRepr,
  $internal,
  $invalidSchemaReason,
  $memIdent,
  $repr,
  $validStorageSchema,
  $validUniformSchema,
  $validVertexSchema,
  isMarkedInternal,
} from '../shared/symbols.ts';
import type { BaseData } from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * Schema of the WGSL `buffer<N>` type: `byteSize` bytes without a type of their own,
 * read and written in shaders through `std.bufferView` and `std.bufferArrayView`.
 * A `byteSize` of 0 stands for a runtime-sized `buffer`.
 */
export interface WgslBuffer<TSize extends number = number> extends BaseData {
  readonly type: 'buffer';
  readonly byteSize: TSize;

  // Type-tokens, not available at runtime
  readonly [$repr]: ArrayBuffer;
  readonly [$inRepr]: ArrayBuffer | ArrayBufferView;
  readonly [$gpuRepr]: buffer;
  readonly [$memIdent]: WgslBuffer;
  readonly [$validStorageSchema]: TSize extends 0 ? false : true;
  readonly [$validUniformSchema]: TSize extends 0 ? false : true;
  readonly [$validVertexSchema]: false;
  readonly [$invalidSchemaReason]: 'Buffers need a size, e.g. d.buffer(256), unless declared in a bind group layout with { storage: d.buffer }';
  // ---
}

/**
 * The contents of a `d.buffer`, as seen by shaders.
 * Pass it to `std.bufferView`, `std.bufferArrayView` and `std.bufferLength`.
 */
export interface buffer {
  readonly [$internal]: true;
  readonly type: 'buffer';
}

/**
 * Creates a schema for `byteSize` raw bytes, the WGSL `buffer<byteSize>` type, viewed in shaders
 * with `std.bufferView` and `std.bufferArrayView`. Without a size it is runtime-sized, which only
 * storage bindings allow, e.g. `{ storage: d.buffer }` in a bind group layout.
 *
 * Requires the `buffer_view` WGSL language extension, see `root.enabledWgslLanguageFeatures`.
 *
 * @example
 * const packet = root.createBuffer(d.buffer(1024)).$usage('storage');
 */
export function buffer(): WgslBuffer<0>;
export function buffer<TSize extends number>(byteSize: TSize): WgslBuffer<TSize>;
export function buffer(byteSize = 0): WgslBuffer {
  if (!Number.isInteger(byteSize) || byteSize < 0 || byteSize % 4 !== 0) {
    throw new Error(
      `Cannot create a buffer schema of ${byteSize} bytes, the size has to be a multiple of 4.`,
    );
  }
  return new WgslBufferImpl(byteSize);
}

export function isWgslBuffer(schema: unknown): schema is WgslBuffer {
  return isMarkedInternal(schema) && (schema as WgslBuffer).type === 'buffer';
}

// --------------
// Implementation
// --------------

class WgslBufferImpl<TSize extends number> implements WgslBuffer<TSize> {
  readonly [$internal] = {};
  readonly type = 'buffer';
  readonly byteSize: TSize;

  // Type-tokens, not available at runtime
  declare readonly [$repr]: ArrayBuffer;
  declare readonly [$inRepr]: ArrayBuffer | ArrayBufferView;
  declare readonly [$gpuRepr]: buffer;
  declare readonly [$memIdent]: WgslBuffer;
  declare readonly [$validStorageSchema]: TSize extends 0 ? false : true;
  declare readonly [$validUniformSchema]: TSize extends 0 ? false : true;
  declare readonly [$validVertexSchema]: false;
  declare readonly [$invalidSchemaReason]: WgslBuffer[typeof $invalidSchemaReason];
  // ---

  constructor(byteSize: TSize) {
    this.byteSize = byteSize;
  }

  toString(): string {
    return this.byteSize === 0 ? 'buffer' : `buffer(${this.byteSize})`;
  }
}
