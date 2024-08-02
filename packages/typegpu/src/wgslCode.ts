import {
  type InlineResolve,
  type ResolutionCtx,
  type Wgsl,
  type WgslResolvable,
  isResolvable,
} from './types';
import { getBuiltinInfo } from './wgslBuiltin';

// ----------
// Public API
// ----------

export interface WgslCode extends WgslResolvable {
  $name(label?: string | undefined): WgslCode;
  getUsedBuiltins(): readonly symbol[];
}

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

  const symbols = segments.filter((s) => typeof s === 'symbol') as symbol[];

  return new WgslCodeImpl(segments, symbols);
}

// --------------
// Implementation
// --------------

class WgslCodeImpl implements WgslCode {
  private _label: string | undefined;

  constructor(
    public readonly segments: (Wgsl | InlineResolve)[],
    private readonly _usedBuiltins: symbol[],
  ) {}

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
      if (typeof s === 'function') {
        const result = s((eventual) => ctx.unwrap(eventual));
        code += ctx.resolve(result);
      } else if (isResolvable(s)) {
        code += ctx.resolve(s);
      } else if (typeof s === 'symbol') {
        const builtin = getBuiltinInfo(s);
        code += ctx.resolve(builtin.identifier);
      } else {
        code += String(s);
      }
    }

    return code;
  }

  getUsedBuiltins() {
    return Array.from(new Set(this._usedBuiltins));
  }

  toString(): string {
    return `code:${this._label ?? '<unnamed>'}`;
  }
}
