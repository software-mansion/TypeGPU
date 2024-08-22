import { namable, resolvable } from './decorators';
import type {
  AnyWgslData,
  ResolutionCtx,
  Wgsl,
  WgslNamable,
  WgslResolvable,
} from './types';
import { code } from './wgslCode';
import { makeIdentifier } from './wgslIdentifier';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface WgslVar<TDataType extends AnyWgslData>
  extends WgslResolvable,
    WgslNamable {
  readonly dataType: TDataType;
  readonly initialValue: Wgsl | undefined;
  readonly scope: VariableScope;
}

/**
 * Creates a variable, with an optional initial value.
 */
export const variable = <TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Wgsl,
  scope: VariableScope = 'private',
): WgslVar<TDataType> => makeVar(dataType, initialValue, scope);

// --------------
// Implementation
// --------------

function resolveVar<TDataType extends AnyWgslData>(
  this: WgslVar<TDataType>,
  ctx: ResolutionCtx,
) {
  const identifier = makeIdentifier();
  if (this.initialValue) {
    ctx.addDeclaration(
      code`var<${this.scope}> ${identifier}: ${this.dataType} = ${this.initialValue};`,
    );
  } else {
    ctx.addDeclaration(
      code`var<${this.scope}> ${identifier}: ${this.dataType};`,
    );
  }

  return ctx.resolve(identifier);
}

const makeVar = <TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue: Wgsl | undefined,
  scope: VariableScope,
) =>
  namable(
    resolvable(
      { typeInfo: 'var' },
      { resolve: resolveVar, dataType, initialValue, scope },
    ),
  );
