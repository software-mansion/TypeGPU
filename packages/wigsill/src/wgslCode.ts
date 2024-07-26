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
  getUsedBuiltins(): symbol[];
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

  return new WgslCodeImpl(segments);
}

// --------------
// Implementation
// --------------

class WgslCodeImpl implements WgslCode {
  private _label: string | undefined;
  private _usedBuiltins: symbol[] = [];

  constructor(public readonly segments: (Wgsl | InlineResolve)[]) {}

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
        this._usedBuiltins.push(s);
        code += builtin.name;
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
