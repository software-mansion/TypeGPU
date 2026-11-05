import { isSnippet, type Snippet } from '../../data/snippet.ts';
import { getResolutionCtx } from '../../execMode.ts';
import type { ResolutionCtx } from '../../types.ts';

type ValueOrArray<T> = T | readonly T[];

function resolvePart(ctx: ResolutionCtx, part: Snippet | string | number) {
  return isSnippet(part) ? ctx.resolveSnippet(part).value : part;
}

/**
 * "The reverse of snipping"
 * Injects resolved snippets into a template string.
 */
export function stitch(
  strings: TemplateStringsArray,
  ...snippets: ValueOrArray<Snippet | string | number | undefined>[]
) {
  const ctx = getResolutionCtx() as ResolutionCtx;

  let result = '';
  for (let i = 0; i < strings.length; ++i) {
    result += strings[i];
    const snippet = snippets[i];
    if (Array.isArray(snippet)) {
      // Joining the defined elements with ', '
      let first = true;
      for (const element of snippet) {
        if (element === undefined) {
          continue;
        }
        result += (first ? '' : ', ') + resolvePart(ctx, element);
        first = false;
      }
    } else if (snippet) {
      result += resolvePart(ctx, snippet as Snippet | string | number);
    }
  }
  return result;
}
