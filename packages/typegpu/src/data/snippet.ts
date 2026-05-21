import { undecorate } from './dataTypes.ts';
import type { UnknownData } from './dataTypes.ts';
import { DEV } from '../shared/env.ts';
import { type BaseData, isNumericSchema } from './wgslTypes.ts';

export type Origin =
  // --- ADDRESS SPACE ORIGINS
  | 'uniform' /*   defined in the 'uniform' address space  */
  | 'readonly' /*  defined in the 'storage' address space, with 'read' access  */
  | 'mutable' /*   defined in the 'storage' address space, with 'read-write' access  */
  | 'workgroup' /* defined in the 'workgroup' address space  */
  | 'private' /*   defined in the 'private' address space  */
  | 'handle' /*    defined in the 'handle' address space  */
  | 'function' /*  defined in a callee, passed down to us as an argument ('function' address space)  */
  // --- DEFINITIONS
  // defined in the current function
  | 'local-def'
  // A reference to a deeply immutable definition, recognized by WGSL as a 'constant'.
  // This is the usual case, read about 'runtime-immutable-def' to know when this doesn't apply.
  // A reference to a tgpu.const().$ value (which is frozen) fits into this category.
  | 'constant-immutable-def'
  // A reference to a deeply immutable definition, NOT recognized by WGSL as a 'constant'.
  // This can happen if say a constant is accessed with a runtime-known index. WGSL doesn't treat it like
  // a 'constant' anymore, but it's still a frozen value in JS, so we must treat it like it's immutable.
  | 'runtime-immutable-def'
  // ---------
  // non-pointer function arguments (or part of an argument).
  | 'argument'
  // not a reference to anything, known at runtime
  | 'runtime'
  // an ephemeral value that is a valid WGSL 'constant' (not to be confused with 'comptime')
  // doesn't always lead to creating a `const` variable, as we cannot always guarantee that
  // the value won't be mutated in JS
  | 'constant';

/**
 * What happens to a snippet's origin when it's deep copied in JS, and left as is in WGSL?
 * e.g. `vec3f(vec3f(0, 1, 2))`
 */
export function fallthroughCopyOrigin(origin: Origin): Origin {
  if (
    origin === 'runtime' || // runtime values stay runtime
    origin === 'constant' // constant values stay constant
  ) {
    // The origin is kept as-is
    return origin;
  }
  // All other origins become runtime
  return 'runtime';
}

/**
 * Whether a snippet aliases a value that lives outside the current expression.
 *
 * @example
 * ```ts
 * function foo(a: number) {
 *   const color = d.vec3f(1, 2, 3);
 *   return color * a;
 * }
 *
 * // References:
 * // -  color
 * // -  a
 * //
 * // Not references:
 * // - d.vec3f(1, 2, 3)
 * // - color * a
 * ```
 */
export function isAlias(snippet: Snippet) {
  return !(snippet.origin === 'runtime' || snippet.origin === 'constant');
}

export const originToPtrParams = {
  uniform: { space: 'uniform', access: 'read' },
  readonly: { space: 'storage', access: 'read' },
  mutable: { space: 'storage', access: 'read-write' },
  workgroup: { space: 'workgroup', access: 'read-write' },
  private: { space: 'private', access: 'read-write' },
  function: { space: 'function', access: 'read-write' },
  // Local declarations are also in the `function` address space
  'local-def': { space: 'function', access: 'read-write' },
} as const;
export type OriginToPtrParams = typeof originToPtrParams;

export interface Snippet {
  readonly value: unknown;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: BaseData | UnknownData;
  readonly origin: Origin;
}

export interface ResolvedSnippet extends Snippet {
  readonly value: string;
  readonly dataType: BaseData;
}

export type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

class SnippetImpl implements Snippet {
  readonly value: unknown;
  readonly dataType: BaseData | UnknownData;
  readonly origin: Origin;

  constructor(value: unknown, dataType: BaseData | UnknownData, origin: Origin) {
    this.value = value;
    this.dataType = dataType;
    this.origin = origin;
  }
}

export function isSnippet(value: unknown): value is Snippet {
  return value instanceof SnippetImpl;
}

export function isSnippetNumeric(snippet: Snippet) {
  return isNumericSchema(snippet.dataType);
}

export function snip(value: string, dataType: BaseData, origin: Origin): ResolvedSnippet;
export function snip(value: unknown, dataType: BaseData | UnknownData, origin: Origin): Snippet;
export function snip(
  value: unknown,
  dataType: BaseData | UnknownData,
  origin: Origin,
): Snippet | ResolvedSnippet {
  if (DEV && isSnippet(value)) {
    // An early error, but not worth checking every time in production
    throw new Error('Cannot nest snippets');
  }

  return new SnippetImpl(
    value,
    // We don't care about attributes in snippet land, so we discard that information.
    undecorate(dataType as BaseData),
    origin,
  );
}
