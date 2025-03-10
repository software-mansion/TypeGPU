import { $internal } from '../../shared/symbols';
import type { AnyWgslData } from '../../data/wgslTypes';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import type { ResolutionCtx, SelfResolvable } from '../../types';
import { valueProxyHandler } from '../valueProxyUtils';

// ----------
// Public API
// ----------

export type VariableScope = 'private' | 'workgroup';

export interface TgpuVar<
  TScope extends VariableScope = VariableScope,
  TDataType extends AnyWgslData = AnyWgslData,
> extends TgpuNamable {
  value: Infer<TDataType>;
  readonly scope: TScope;
}

/**
 * Defines a variable scoped to each entry function (private).
 *
 * @param dataType The schema of the held data's type
 * @param initialValue If not provided, the variable will be initialized to the dataType's "zero-value".
 */
export function privateVar<TDataType extends AnyWgslData>(
  dataType: TDataType,
  initialValue?: Infer<TDataType>,
): TgpuVar<'private', TDataType> {
  return new TgpuVarImpl('private', dataType, initialValue);
}

/**
 * Defines a variable scoped to the whole workgroup, shared between entry functions
 * of the same invocation.
 *
 * @param dataType The schema of the held data's type
 */
export function workgroupVar<TDataType extends AnyWgslData>(
  dataType: TDataType,
): TgpuVar<'workgroup', TDataType> {
  return new TgpuVarImpl('workgroup', dataType);
}

// --------------
// Implementation
// --------------

class TgpuVarImpl<TScope extends VariableScope, TDataType extends AnyWgslData>
  implements TgpuVar<TScope, TDataType>, SelfResolvable
{
  private _label: string | undefined;

  constructor(
    readonly scope: TScope,
    private readonly _dataType: TDataType,
    private readonly _initialValue?: Infer<TDataType> | undefined,
  ) {}

  $name(label: string) {
    this._label = label;
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);

    if (this._initialValue) {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)} = ${ctx.resolveValue(this._initialValue, this._dataType)};`,
      );
    } else {
      ctx.addDeclaration(
        `var<${this.scope}> ${id}: ${ctx.resolve(this._dataType)};`,
      );
    }

    return id;
  }

  get label() {
    return this._label;
  }

  toString() {
    return `var:${this.label ?? '<unnamed>'}`;
  }

  get value(): Infer<TDataType> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access tgpu.var's value directly in JS.`);
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${this.label ?? '<unnamed>'}`,
        [$internal]: {
          dataType: this._dataType,
        },
      },
      valueProxyHandler,
    ) as Infer<TDataType>;
  }
}
