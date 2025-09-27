import { undecorate } from './dataTypes.ts';
import type { AnyData, UnknownData } from './dataTypes.ts';
import { DEV } from '../shared/env.ts';
import { type AddressSpace, isNumericSchema } from './wgslTypes.ts';

export interface Snippet {
  readonly value: unknown;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: AnyData | UnknownData;
  readonly ref: AddressSpace | undefined;
}

export interface ResolvedSnippet {
  readonly value: string;
  /**
   * The type that `value` is assignable to (not necessary exactly inferred as).
   * E.g. `1.1` is assignable to `f32`, but `1.1` itself is an abstract float
   */
  readonly dataType: AnyData;
  readonly ref: AddressSpace | undefined;
}

export type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

class SnippetImpl implements Snippet {
  constructor(
    readonly value: unknown,
    readonly dataType: AnyData | UnknownData,
    readonly ref: AddressSpace | undefined,
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
  ref: AddressSpace | undefined,
): ResolvedSnippet;
export function snip(
  value: unknown,
  dataType: AnyData | UnknownData,
  ref: AddressSpace | undefined,
): Snippet;
export function snip(
  value: unknown,
  dataType: AnyData | UnknownData,
  ref: AddressSpace | undefined,
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
