import {
  type ResolutionCtx,
  type Wgsl,
  type WgslResolvable,
  isResolvable,
} from './types';

// ----------
// Public API
// ----------

export interface WgslCode extends WgslResolvable {
  $name(label?: string | undefined): WgslCode;
}

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
  private _label: string | undefined;

  constructor(public readonly segments: Wgsl[]) {}

  get label() {
    return this._label;
  }

  $name(label?: string | undefined) {
    this._label = label;
    return this;
  }

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

  toString(): string {
    return `code:${this._label ?? '<unnamed>'}`;
  }
}
