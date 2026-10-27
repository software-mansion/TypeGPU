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
  readonly [$gpuRepr]: bytes;
  readonly [$memIdent]: WgslBuffer;
  readonly [$validStorageSchema]: TSize extends 0 ? false : true;
  readonly [$validUniformSchema]: TSize extends 0 ? false : true;
  readonly [$validVertexSchema]: false;
  readonly [$invalidSchemaReason]: 'Buffers need a size, e.g. d.bytes(256), unless declared in a bind group layout with { storage: d.bytes }';
  // ---
}

/**
 * The contents of a `d.bytes` buffer, as seen by shaders.
 * Pass it to `std.bufferView`, `std.bufferArrayView` and `std.bufferLength`.
 */
export interface bytes {
  readonly [$internal]: true;
  readonly type: 'bytes';
}

/**
 * Creates a schema for `byteSize` raw bytes, resolved to the WGSL `buffer<byteSize>` type.
 * Shaders read and write them as any host-shareable type with `std.bufferView`
 * and `std.bufferArrayView`.
 *
 * Without a size (or with 0), it describes a runtime-sized `buffer`, which only storage
 * bindings allow. Bind group layouts take the function itself: `{ storage: d.bytes }`.
 *
 * Requires the `buffer_view` WGSL language extension, check `root.enabledWgslLanguageFeatures`
 * for support.
 *
 * @example
 * const packet = root.createBuffer(d.bytes(1024)).$usage('storage');
 *
 * @param byteSize The size in bytes.
 */
export function bytes(): WgslBuffer<0>;
export function bytes<TSize extends number>(byteSize: TSize): WgslBuffer<TSize>;
export function bytes(byteSize = 0): WgslBuffer {
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
  declare readonly [$gpuRepr]: bytes;
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
    return this.byteSize === 0 ? 'bytes' : `bytes(${this.byteSize})`;
  }
}
