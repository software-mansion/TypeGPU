import type { Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { ResolutionCtx } from '../../types.ts';

type ValueOrArray<T> = T | T[];

/**
 * The reverse of snipping
 */
export function stitch(
  strings: TemplateStringsArray,
  ...snippets: ValueOrArray<Snippet | string | undefined>[]
) {
  const ctx = getResolutionCtx() as ResolutionCtx;

  let result = '';
  for (let i = 0; i < strings.length; ++i) {
    result += strings[i];
    const snippet = snippets[i] as ValueOrArray<Snippet | string | undefined>; // It's there!
    if (Array.isArray(snippet)) {
      result += snippet
        .filter((s) => s !== undefined)
        .map((s) =>
          typeof s === 'string' ? s : ctx.resolve(s.value, s.dataType)
        ).join(', ');
    } else if (snippet) {
      result += typeof snippet === 'string'
        ? snippet
        : ctx.resolve(snippet.value, snippet.dataType);
    }
  }
  return result;
}
