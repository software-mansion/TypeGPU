import {
  type InlineResolve,
  type ResolutionCtx,
  type Wgsl,
  type WgslNamable,
  type WgslResolvable,
  isResolvable,
} from './types';
import { WgslResolvableBase } from './wgslResolvableBase';

// ----------
// Public API
// ----------

export interface WgslCode extends WgslResolvable, WgslNamable {}

export function code(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[] | InlineResolve)[]
): WgslCode {
  const segments: (Wgsl | InlineResolve)[] = strings.flatMap((string, idx) => {
    const param = params[idx];
    if (param === undefined) {
      return [string];
    }

    return Array.isArray(param) ? [string, ...param] : [string, param];
  });

  return new WgslCodeImpl(segments);
}

// --------------
// Implementation
// --------------

class WgslCodeImpl extends WgslResolvableBase implements WgslCode {
  readonly typeInfo = 'code';

  constructor(public readonly segments: (Wgsl | InlineResolve)[]) {
    super();
  }

  resolve(ctx: ResolutionCtx) {
    let code = '';

    for (const s of this.segments) {
      if (typeof s === 'function') {
        const result = s((eventual) => ctx.unwrap(eventual));
        code += ctx.resolve(result);
      } else if (isResolvable(s)) {
        code += ctx.resolve(s);
      } else {
        code += String(s);
      }
    }

    return code;
  }
}
