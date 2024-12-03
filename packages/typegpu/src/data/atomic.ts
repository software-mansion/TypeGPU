import type { Infer } from '../shared/repr';
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
): Atomic<TSchema> {
  return new AtomicImpl(data);
}

/**
 * Checks whether the passed in value is a d.atomic schema.
 *
 * @example
 * isAtomicSchema(d.atomic(d.u32)) // true
 * isAtomicSchema(d.u32) // false
 */
export function isAtomicSchema<T extends Atomic<U32 | I32>>(
  schema: T | unknown,
): schema is T {
  return schema instanceof AtomicImpl;
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
