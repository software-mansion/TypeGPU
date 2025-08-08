import { undecorate } from './decorateUtils.ts';
import type { AnyData, UnknownData } from './dataTypes.ts';
import { DEV } from '../shared/env.ts';
import { isNumericSchema } from './wgslTypes.ts';

export interface Snippet {
  readonly value: unknown;
  readonly dataType: AnyData | UnknownData;
}

export type MapValueToSnippet<T> = { [K in keyof T]: Snippet };

class SnippetImpl implements Snippet {
  constructor(
    readonly value: unknown,
    readonly dataType: AnyData | UnknownData,
  ) {}
}

export function isSnippet(value: unknown): value is Snippet {
  return value instanceof SnippetImpl;
}

export function isSnippetNumeric(snippet: Snippet) {
  return isNumericSchema(snippet.dataType);
}

export function snip(value: unknown, dataType: AnyData | UnknownData): Snippet {
  if (DEV && isSnippet(value)) {
    // An early error, but not worth checking every time in production
    throw new Error('Cannot nest snippets');
  }

  return new SnippetImpl(
    value,
    // We don't care about attributes in snippet land, so we discard that information.
    undecorate(dataType as AnyData),
  );
}
