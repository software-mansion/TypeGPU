import { stitch } from '../core/resolve/stitch.ts';
import { DEV } from '../shared/env.ts';
import type { AnyData, UnknownData } from './dataTypes.ts';
import { undecorate } from './dataTypes.ts';
import { isNaturallyEphemeral, isNumericSchema } from './wgslTypes.ts';

export type Origin =
  | 'uniform'
  | 'readonly' // equivalent to ptr<storage, ..., read>
  | 'mutable' // equivalent to ptr<storage, ..., read-write>
  | 'workgroup'
  | 'private'
  | 'function'
  | 'this-function'
  | 'handle'
  // is an argument (or part of an argument) given to the
  // function we're resolving. This includes primitives, to
  // catch cases where we update an argument's primitive member
  // prop, e.g.: `vec.x += 1;`
  | 'argument'
  // not a ref to anything, known at runtime
  | 'runtime'
  // not a ref to anything, known at pipeline creation time
  // (not to be confused with 'comptime')
  // note that this doesn't automatically mean the value can be stored in a `const`
  // variable, more so that it's valid to do so in WGSL (but not necessarily safe to do in JS shaders)
  | 'constant'
  // don't even get me started on these. They're references to non-primitive values that originate
  // from a tgpu.const(...).$ call.
  | 'constant-tgpu-const-ref' /* turns into a `const` when assigned to a variable */
  | 'runtime-tgpu-const-ref' /* turns into a `let` when assigned to a variable */;

export function isEphemeralSnippet(snippet: Snippet) {
  if (snippet.origin === 'argument') {
    // Arguments are considered ephemeral if their data type
    // is naturally ephemeral.
    // (primitives => true, non-primitives => false).
    return isNaturallyEphemeral(snippet.dataType);
  }
  return snippet.origin === 'runtime' || snippet.origin === 'constant';
}

/**
 * Returns a reason if the snippet is immutable, or undefined if it is mutable.
 */
export function getImmutableReason(snippet: Snippet): string | undefined {
  if (snippet.origin === 'argument') {
    return stitch`Cannot mutate '${snippet}', arguments are immutable. You can copy them into a local variable first.`;
  }

  if (
    snippet.origin === 'constant' ||
    snippet.origin === 'constant-tgpu-const-ref' ||
    snippet.origin === 'runtime-tgpu-const-ref'
  ) {
    return stitch`Cannot mutate '${snippet}', constants are immutable.`;
  }

  if (snippet.origin === 'uniform') {
    return stitch`Cannot mutate '${snippet}', uniforms are immutable.`;
  }

  if (snippet.origin === 'handle') {
    return stitch`Cannot mutate '${snippet}', handles are immutable.`;
  }

  if (snippet.origin === 'readonly') {
    return stitch`Cannot mutate '${snippet}', it's bound as a readonly resource.`;
  }

  return undefined; // Mutable 🎉
}

export const originToPtrParams = {
  uniform: { space: 'uniform', access: 'read' },
  readonly: { space: 'storage', access: 'read' },
  mutable: { space: 'storage', access: 'read-write' },
  workgroup: { space: 'workgroup', access: 'read-write' },
  private: { space: 'private', access: 'read-write' },
  function: { space: 'function', access: 'read-write' },
  'this-function': { space: 'function', access: 'read-write' },
} as const;
export type OriginToPtrParams = typeof originToPtrParams;

export interface Snippet {
  readonly value: unknown;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: AnyData | UnknownData;
  readonly origin: Origin;
}

export interface ResolvedSnippet {
  readonly value: string;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: AnyData;
  readonly origin: Origin;
}

export type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

class SnippetImpl implements Snippet {
  constructor(
    readonly value: unknown,
    readonly dataType: AnyData | UnknownData,
    readonly origin: Origin,
  ) {}
}

export function isSnippet(value: unknown): value is Snippet {
  return value instanceof SnippetImpl;
}

export function isSnippetNumeric(snippet: Snippet) {
  return isNumericSchema(snippet.dataType);
}

export function snip(
  value: string,
  dataType: AnyData,
  origin: Origin,
): ResolvedSnippet;
export function snip(
  value: unknown,
  dataType: AnyData | UnknownData,
  origin: Origin,
): Snippet;
export function snip(
  value: unknown,
  dataType: AnyData | UnknownData,
  origin: Origin,
): Snippet | ResolvedSnippet {
  if (DEV && isSnippet(value)) {
    // An early error, but not worth checking every time in production
    throw new Error('Cannot nest snippets');
  }

  return new SnippetImpl(
    value,
    // We don't care about attributes in snippet land, so we discard that information.
    undecorate(dataType as AnyData),
    origin,
  );
}
