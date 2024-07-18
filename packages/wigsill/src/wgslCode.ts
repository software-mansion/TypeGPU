import {
  type ResolutionCtx,
  type Wgsl,
  type WgslResolvable,
  isResolvable,
} from './types';

// ----------
// Public API
// ----------

export interface WgslCode extends WgslResolvable {}

export function code(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[])[]
): WgslCode {
  const segments: Wgsl[] = strings.flatMap((string, idx) => {
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

class WgslCodeImpl implements WgslCode {
  constructor(public readonly segments: Wgsl[]) {}

  resolve(ctx: ResolutionCtx) {
    let code = '';

    for (const s of this.segments) {
      if (isResolvable(s)) {
        code += ctx.resolve(s);
      } else {
        code += String(s);
      }
    }

    return code;
  }
}
