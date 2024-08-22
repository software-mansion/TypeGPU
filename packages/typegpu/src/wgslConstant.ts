import { namable, resolvable } from './decorators';
import type { ResolutionCtx, Wgsl, WgslNamable, WgslResolvable } from './types';
import { code } from './wgslCode';
import { makeIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export interface WgslConst extends WgslResolvable, WgslNamable {
  expr: Wgsl;
}

/**
 * Creates a constant is computed at shader initialization according
 * to the passed in expression.
 */
export function constant(expr: Wgsl): WgslConst {
  return makeConst(expr);
}

// --------------
// Implementation
// --------------

function resolveConst(this: WgslConst, ctx: ResolutionCtx) {
  const identifier = makeIdentifier().$name(this.label);
  ctx.addDeclaration(code`const ${identifier} = ${this.expr};`);
  return ctx.resolve(identifier);
}

const makeConst = (expr: Wgsl) =>
  namable(
    resolvable(
      { typeInfo: 'const' },
      {
        expr,
        resolve: resolveConst,
      },
    ),
  );
