import type { Infer, MemIdentity } from '../shared/repr.ts';
import { $internal } from '../shared/symbols.ts';
import {
  $gpuRepr,
  $memIdent,
  $repr,
  $validStorageSchema,
  $validUniformSchema,
  $validVertexSchema,
} from '../shared/symbols.ts';
import type { Atomic, atomicI32, atomicU32, I32, U32 } from './wgslTypes.ts';

// ----------
// Public API
// ----------

/**
 * Marks a concrete integer scalar type schema (u32 or i32) as a WGSL atomic.
 *
 * @example
 * const atomicU32 = d.atomic(d.u32);
 * const atomicI32 = d.atomic(d.i32);
 *
 * @param data Underlying type schema.
 */
export function atomic<TSchema extends U32 | I32>(data: TSchema): Atomic<TSchema> {
  return new AtomicImpl(data);
}

// --------------
// Implementation
// --------------

class AtomicImpl<TSchema extends U32 | I32> implements Atomic<TSchema> {
  public readonly [$internal] = {};
  public readonly type = 'atomic';

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Infer<TSchema>;
  declare readonly [$memIdent]: MemIdentity<TSchema>;
  declare readonly [$gpuRepr]: TSchema extends U32 ? atomicU32 : atomicI32;
  declare readonly [$validStorageSchema]: true;
  declare readonly [$validUniformSchema]: true;
  declare readonly [$validVertexSchema]: true;
  // ---

  constructor(public readonly inner: TSchema) {}
}
