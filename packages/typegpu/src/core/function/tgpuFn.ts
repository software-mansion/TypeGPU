import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import { valueList } from '../../resolutionUtils';
import type { Block } from '../../smol';
import { code } from '../../tgpuCode';
import type {
  AnyTgpuData,
  ResolutionCtx,
  TgpuResolvable,
  Wgsl,
} from '../../types';
import { createFnCore } from './fnCore';
import type { Implementation, UnwrapArgs, UnwrapReturn } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a function signature (its arguments and return type)
 */
export interface TgpuFnShell<
  Args extends AnyTgpuData[],
  Return extends AnyTgpuData | undefined,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
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
  Args extends AnyTgpuData[],
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

export type TgpuFn<
  Args extends AnyTgpuData[],
  Return extends AnyTgpuData | undefined = undefined,
> = TgpuFnBase<Args, Return> &
  ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>);

export function fn<Args extends AnyTgpuData[] | []>(
  argTypes: Args,
  returnType?: undefined,
): TgpuFnShell<Args, undefined>;

export function fn<Args extends AnyTgpuData[] | [], Return extends AnyTgpuData>(
  argTypes: Args,
  returnType: Return,
): TgpuFnShell<Args, Return>;

export function fn<
  Args extends AnyTgpuData[] | [],
  Return extends AnyTgpuData | undefined = undefined,
>(argTypes: Args, returnType?: Return): TgpuFnShell<Args, Return> {
  return {
    argTypes,
    returnType,

    does(implementation: Implementation<Args, Return>): TgpuFn<Args, Return> {
      return createFn(this, implementation);
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
  Args extends AnyTgpuData[],
  Return extends AnyTgpuData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  implementation: Implementation<Args, Return>,
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

    resolve(ctx: ResolutionCtx): string {
      return core.resolve(ctx);
    },
  };

  const call = (...args: UnwrapArgs<Args>): UnwrapReturn<Return> => {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(fn, args as Wgsl[]) as UnwrapReturn<Return>;
    }

    if (typeof implementation === 'string') {
      throw new Error(
        'Cannot execute on the CPU functions constructed with raw WGSL',
      );
    }

    return implementation(...args);
  };

  const fn = Object.assign(call, fnBase);

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => core.label,
  });

  return fn;
}

class FnCall<Args extends AnyTgpuData[], Return extends AnyTgpuData | undefined>
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
