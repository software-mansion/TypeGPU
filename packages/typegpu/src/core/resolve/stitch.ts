import type { Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { ResolutionCtx } from '../../types.ts';

type ValueOrArray<T> = T | T[];

/**
 * "The reverse of snipping"
 * Injects resolved snippets into a template string.
 */
export function stitch(
  strings: TemplateStringsArray,
  ...snippets: ValueOrArray<Snippet | string | undefined>[]
) {
  const ctx = getResolutionCtx() as ResolutionCtx;

  function resolveStringOrSnippet(stringOrSnippet: string | Snippet) {
    return typeof stringOrSnippet === 'string'
      ? stringOrSnippet
      : ctx.resolve(stringOrSnippet.value, stringOrSnippet.dataType);
  }

  let result = '';
  for (let i = 0; i < strings.length; ++i) {
    result += strings[i];
    const snippet = snippets[i];
    if (Array.isArray(snippet)) {
      result += snippet
        .filter((s) => s !== undefined)
        .map(resolveStringOrSnippet)
        .join(', ');
    } else if (snippet) {
      result += resolveStringOrSnippet(snippet);
    }
  }
  return result;
}
