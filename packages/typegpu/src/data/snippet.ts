import { undecorate } from './dataTypes.ts';
import type { AnyData, UnknownData } from './dataTypes.ts';
import { DEV } from '../shared/env.ts';
import { isNumericSchema } from './wgslTypes.ts';

export type RefSpace =
  | 'uniform'
  | 'readonly' // equivalent to ptr<storage, ..., read>
  | 'mutable' // equivalent to ptr<storage, ..., read-write>
  | 'workgroup'
  | 'private'
  | 'function'
  | 'handle'
  // more specific version of 'function', telling us that the ref is
  // to a value defined in the function
  | 'this-function'
  // not a ref to anything, known at runtime
  | 'runtime'
  // not a ref to anything, known at pipeline creation time
  // (not to be confused with 'comptime')
  // note that this doesn't automatically mean the value can be stored in a `const`
  // variable, more so that it's valid to do so in WGSL (but not necessarily safe to do in TGSL)
  | 'constant'
  | 'constant-ref';

export function isSpaceRef(space: RefSpace) {
  return space !== 'runtime' && space !== 'constant';
}

export function isRef(snippet: Snippet) {
  return isSpaceRef(snippet.ref);
}

export const refSpaceToPtrParams = {
  uniform: { space: 'uniform', access: 'read' },
  readonly: { space: 'storage', access: 'read' },
  mutable: { space: 'storage', access: 'read-write' },
  workgroup: { space: 'workgroup', access: 'read-write' },
  private: { space: 'private', access: 'read-write' },
  function: { space: 'function', access: 'read-write' },
  'this-function': { space: 'function', access: 'read-write' },
} as const;

export interface Snippet {
  readonly value: unknown;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: AnyData | UnknownData;
  readonly ref: RefSpace;
}

export interface ResolvedSnippet {
  readonly value: string;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: AnyData;
  readonly ref: RefSpace;
}

export type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

class SnippetImpl implements Snippet {
  constructor(
    readonly value: unknown,
    readonly dataType: AnyData | UnknownData,
    readonly ref: RefSpace,
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
  ref: RefSpace,
): ResolvedSnippet;
export function snip(
  value: unknown,
  dataType: AnyData | UnknownData,
  ref: RefSpace,
): Snippet;
export function snip(
  value: unknown,
  dataType: AnyData | UnknownData,
  ref: RefSpace,
): Snippet | ResolvedSnippet {
  if (DEV && isSnippet(value)) {
    // An early error, but not worth checking every time in production
    throw new Error('Cannot nest snippets');
  }

  return new SnippetImpl(
    value,
    // We don't care about attributes in snippet land, so we discard that information.
    undecorate(dataType as AnyData),
    ref,
  );
}
