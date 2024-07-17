import {
  type ResolutionCtx,
  type Wgsl,
  type WgslResolvable,
  isResolvable,
} from './types';

export class WGSLCode implements WgslResolvable {
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

export function code(
  strings: TemplateStringsArray,
  ...params: (Wgsl | Wgsl[])[]
): WGSLCode {
  const segments: Wgsl[] = strings.flatMap((string, idx) => {
    const param = params[idx];
    if (param === undefined) {
      return [string];
    }

    return Array.isArray(param) ? [string, ...param] : [string, param];
  });

  return new WGSLCode(segments);
}
