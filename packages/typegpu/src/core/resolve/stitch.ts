import { isSnippet, type Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { ResolutionCtx } from '../../types.ts';

type ValueOrArray<T> = T | T[];

/**
 * "The reverse of snipping"
 * Injects resolved snippets into a template string.
 */
export function stitch(
  strings: TemplateStringsArray,
  ...snippets: ValueOrArray<Snippet | string | number | undefined>[]
) {
  const ctx = getResolutionCtx() as ResolutionCtx;

  function resolveSnippet(maybeSnippet: Snippet | string | number) {
    return isSnippet(maybeSnippet)
      ? ctx.resolve(maybeSnippet.value, maybeSnippet.dataType).value
      : maybeSnippet;
  }

  let result = '';
  for (let i = 0; i < strings.length; ++i) {
    result += strings[i];
    const snippet = snippets[i];
    if (Array.isArray(snippet)) {
      result += snippet
        .filter((s) => s !== undefined)
        .map(resolveSnippet)
        .join(', ');
    } else if (snippet) {
      result += resolveSnippet(snippet);
    }
  }
  return result;
}
