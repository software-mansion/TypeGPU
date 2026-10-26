import type { AnyNode } from 'tinyest';
import { isSnippet, type Snippet } from '../data/snippet.ts';
import { getResolutionCtx } from '../execMode.ts';
import { getSourceNode } from './stringifySnippet.ts';
import { ResolutionError } from 'typegpu';

/**
 * Throws an error that also includes a source map (if it is available).
 */
export function fail(
  item: Snippet | AnyNode,
  reason: string,
  suggestions?: string | string[],
): never {
  let message = reason;
  if (suggestions !== undefined) {
    message += `\n-----\n`;
    message += Array.isArray(suggestions) ? suggestions.join('\n') : suggestions;
    message += `\n-----`;
  }

  const ctx = getResolutionCtx();
  const node = isSnippet(item) ? getSourceNode(item) : item;
  const source = node !== undefined ? ctx?.sourceMap.get(node) : undefined;

  const error = new ResolutionError(message, [], source);
  throw error;
}
