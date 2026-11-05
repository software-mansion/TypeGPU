import type * as tinyest from 'tinyest';
import type { Snippet } from '../data/snippet.ts';
import { stringifyNode } from '../shared/tseynit.ts';

/**
 * The JS expression that first produced a given snippet.
 * Snippets can be shared (e.g. every reference to a variable returns the same snippet),
 * so only the first, most specific node is remembered.
 */
const sourceNodes = new WeakMap<Snippet, tinyest.Expression>();

export function setSourceNode(snippet: Snippet, node: tinyest.Expression): Snippet {
  if (!sourceNodes.has(snippet)) {
    sourceNodes.set(snippet, node);
  }
  return snippet;
}

export function getSourceNode(snippet: Snippet): tinyest.Expression | undefined {
  return sourceNodes.get(snippet);
}

/**
 * Describes a snippet in a human-readable way, meant to be used in error messages.
 * Prefers the JS expression that produced the snippet, falling back to its value.
 */
export function stringifySnippet(snippet: Snippet): string {
  const node = getSourceNode(snippet);
  return node !== undefined ? stringifyNode(node) : String(snippet.value);
}
