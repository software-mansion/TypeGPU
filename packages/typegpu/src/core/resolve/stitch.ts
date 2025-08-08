import type { Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { ResolutionCtx } from '../../types.ts';

type ValueOrArray<T> = T | T[];

/**
 * The reverse of snipping
 */
export function stitch(
  strings: TemplateStringsArray,
  ...snippets: ValueOrArray<Snippet | undefined>[]
) {
  const ctx = getResolutionCtx() as ResolutionCtx;

  let result = '';
  for (let i = 0; i < strings.length; ++i) {
    result += strings[i];
    const snippet = snippets[i] as ValueOrArray<Snippet | undefined>; // It's there!
    if (Array.isArray(snippet)) {
      result += snippet
        .filter((s) => !!s)
        .map((s) => ctx.resolve(s.value, s.dataType)).join(', ');
    } else if (snippet) {
      result += ctx.resolve(snippet.value, snippet.dataType);
    }
  }
  return result;
}
