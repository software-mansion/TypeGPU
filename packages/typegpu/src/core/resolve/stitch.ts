import type { Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { ResolutionCtx } from '../../types.ts';

/**
 * The reverse of snipping
 * @param strings T
 * @param ctx
 * @param snippets
 * @returns
 */
export function stitch(
  strings: TemplateStringsArray,
  ...snippets: (Snippet | Snippet[])[]
) {
  const ctx = getResolutionCtx() as ResolutionCtx;

  let result = '';
  for (let i = 0; i < strings.length; ++i) {
    result += strings[i];
    const snippet = snippets[i] as Snippet | Snippet[]; // It's there!
    if (Array.isArray(snippet)) {
      result += snippet.map((s) => ctx.resolve(s.value, s.dataType)).join(', ');
    } else {
      result += ctx.resolve(snippet.value, snippet.dataType);
    }
  }
  return result;
}
