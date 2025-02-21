import type { Infer, MemIdentity } from '../shared/repr';
import type { Atomic, I32, U32, atomicI32, atomicU32 } from './wgslTypes';

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
export function atomic<TSchema extends U32 | I32>(
  data: TSchema,
): Atomic<TSchema> {
  return new AtomicImpl(data);
}

// --------------
// Implementation
// --------------

class AtomicImpl<TSchema extends U32 | I32> implements Atomic<TSchema> {
  public readonly type = 'atomic';
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TSchema>;
  /** Type-token, not available at runtime */
  public readonly '~memIdent'!: MemIdentity<TSchema>;
  /** Type-token, not available at runtime */
  public readonly '~gpuRepr': TSchema extends U32 ? atomicU32 : atomicI32;

  constructor(public readonly inner: TSchema) {}
}
