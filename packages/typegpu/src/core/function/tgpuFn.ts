import type { Block } from 'tinyest';
import type { AnyWgslData } from '../../data/wgslTypes';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import { valueList } from '../../resolutionUtils';
import { code } from '../../tgpuCode';
import type {
  Eventual,
  ResolutionCtx,
  TgpuResolvable,
  TgpuSlot,
  Wgsl,
} from '../../types';
import { createFnCore } from './fnCore';
import type { Implementation, InferArgs, InferReturn } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a function signature (its arguments and return type)
 */
export interface TgpuFnShell<
  Args extends AnyWgslData[] = AnyWgslData[],
  Return extends AnyWgslData | undefined = AnyWgslData | undefined,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (...args: InferArgs<Args>) => InferReturn<Return>,
  ): TgpuFn<Args, Return>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(implementation: string): TgpuFn<Args, Return>;
}

interface TgpuFnBase<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TgpuFn<Args, Return>;
}

export type TgpuFn<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined = undefined,
> = TgpuFnBase<Args, Return> &
  ((...args: InferArgs<Args>) => InferReturn<Return>);

export function fn<Args extends AnyWgslData[] | []>(
  argTypes: Args,
  returnType?: undefined,
): TgpuFnShell<Args, undefined>;

export function fn<Args extends AnyWgslData[] | [], Return extends AnyWgslData>(
  argTypes: Args,
  returnType: Return,
): TgpuFnShell<Args, Return>;

export function fn<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined = undefined,
>(argTypes: Args, returnType?: Return): TgpuFnShell<Args, Return> {
  return {
    argTypes,
    returnType,

    does(
      implementation: Implementation<InferArgs<Args>, InferReturn<Return>>,
    ): TgpuFn<Args, Return> {
      return createFn(this, implementation as Implementation);
    },
  };
}

export function procedure(implementation: () => void) {
  return fn([]).does(implementation);
}

// --------------
// Implementation
// --------------

function createFn<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  implementation: Implementation,
): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return>;

  const core = createFnCore(shell, implementation);

  const fnBase: This = {
    shell,

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    $__ast(argNames: string[], body: Block): This {
      // When receiving a pre-built $__ast, we are receiving $uses alongside it, so
      // we do not need to verify external names.
      core.setAst({ argNames, body, externalNames: [] });
      return this;
    },

    $name(newLabel: string): This {
      core.label = newLabel;
      return this;
    },

    with(slot, value): TgpuFn<Args, Return> {
      return createBoundFunction(fn, slot, value);
    },

    resolve(ctx: ResolutionCtx): string {
      return core.resolve(ctx);
    },
  };

  const call = (...args: unknown[]): unknown => {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(fn, args as Wgsl[]);
    }

    if (typeof implementation === 'string') {
      throw new Error(
        'Cannot execute on the CPU functions constructed with raw WGSL',
      );
    }

    return implementation(...args);
  };

  const fn = Object.assign(call, fnBase) as TgpuFn<Args, Return>;

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => core.label,
  });

  return fn;
}

function createBoundFunction<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined,
>(
  innerFn: TgpuFn<Args, Return>,
  slot: TgpuSlot<unknown>,
  slotValue: unknown,
): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return>;

  const fnBase: This = {
    shell: innerFn.shell,

    $uses(newExternals) {
      innerFn.$uses(newExternals);
      return this;
    },

    $__ast(argNames: string[], body: Block): This {
      innerFn.$__ast(argNames, body);
      return this;
    },

    $name(newLabel: string): This {
      innerFn.$name(newLabel);
      return this;
    },

    with(slot, value): TgpuFn<Args, Return> {
      return createBoundFunction(fn, slot, value);
    },

    resolve(ctx: ResolutionCtx): string {
      return ctx.resolve(innerFn, [[slot, slotValue]]);
    },
  };

  const call = (...args: InferArgs<Args>): unknown => {
    return innerFn(...args);
  };

  const fn = Object.assign(call, fnBase) as TgpuFn<Args, Return>;

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => innerFn.label,
  });

  return fn;
}

class FnCall<Args extends AnyWgslData[], Return extends AnyWgslData | undefined>
  implements TgpuResolvable
{
  constructor(
    private readonly _fn: TgpuFnBase<Args, Return>,
    private readonly _params: Wgsl[],
  ) {}

  get label() {
    return this._fn.label;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this._fn}(${valueList(this._params)})`);
  }
}
