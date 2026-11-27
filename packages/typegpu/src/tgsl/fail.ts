import type { AnyNode } from 'tinyest';
import { isSnippet, type Snippet } from '../data/snippet.ts';
import { getResolutionCtx } from '../execMode.ts';
import { getSourceNode } from './stringifySnippet.ts';
import { ResolutionError } from '../errors.ts';

/**
 * Throws an error that also includes a source map (if it is available).
 * If `item` is provided, it will be used to pin-point the exact error location.
 */
export function fail(reason: string, item?: Snippet | AnyNode, suggestions?: string[]): never {
  let message = reason;
  if (suggestions !== undefined) {
    message += `\n-----\n${suggestions.join('\n')}\n-----`;
  }

  const ctx = getResolutionCtx();
  const node = isSnippet(item) ? getSourceNode(item) : item;
  const source = node !== undefined ? ctx?.sourceMap.get(node) : undefined;

  throw new ResolutionError(message, [], source);
}
