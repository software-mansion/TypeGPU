import type { Infer } from '../shared/repr';
import type { Exotic } from './exotic';
import type { Atomic, I32, U32 } from './wgslTypes';

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
): Atomic<Exotic<TSchema>> {
  return new AtomicImpl(data as Exotic<TSchema>);
}

// --------------
// Implementation
// --------------

class AtomicImpl<TSchema extends U32 | I32> implements Atomic<TSchema> {
  public readonly type = 'atomic';
  /** Type-token, not available at runtime */
  public readonly __repr!: Infer<TSchema>;

  constructor(public readonly inner: TSchema) {}
}
