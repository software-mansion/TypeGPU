import type { Infer } from '../../data';
import type { AnyWgslData } from '../../data/wgslTypes';
import type { TgpuNamable } from '../../namable';
import { createDualImpl } from '../../shared/generators';
import { $internal } from '../../shared/symbols';
import {
  type Labelled,
  type ResolutionCtx,
  type SelfResolvable,
  UnknownData,
  type Wgsl,
} from '../../types';
import type { TgpuBufferUsage } from '../buffer/bufferUsage';
import {
  type Eventual,
  type Providing,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
  isAccessor,
} from '../slot/slotTypes';
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
> extends TgpuNamable,
    Labelled {
  readonly resourceType: 'function';
  readonly shell: TgpuFnShell<Args, Return>;
  readonly '~providing'?: Providing | undefined;

  $uses(dependencyMap: Record<string, unknown>): this;
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TgpuFn<Args, Return>;
  with<T extends AnyWgslData>(
    accessor: TgpuAccessor<T>,
    value: TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
  ): TgpuFn<Args, Return>;
}

export type TgpuFn<
  Args extends AnyWgslData[] = AnyWgslData[],
  Return extends AnyWgslData | undefined = AnyWgslData | undefined,
> = TgpuFnBase<Args, Return> &
  ((...args: InferArgs<Args>) => InferReturn<Return>) & {
    readonly [$internal]: {
      implementation: Implementation<InferArgs<Args>, InferReturn<Return>>;
    };
  };

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

export function isTgpuFn<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined = undefined,
>(value: unknown | TgpuFn<Args, Return>): value is TgpuFn<Args, Return> {
  return (value as TgpuFn<Args, Return>)?.resourceType === 'function';
}

// --------------
// Implementation
// --------------

function stringifyPair([slot, value]: SlotValuePair): string {
  return `${slot.label ?? '<unnamed>'}=${value}`;
}

function createFn<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  implementation: Implementation,
): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return> & SelfResolvable;

  const core = createFnCore(shell, implementation);

  const fnBase: This = {
    shell,
    resourceType: 'function' as const,

    $uses(newExternals: Record<string, unknown>) {
      core.applyExternals(newExternals);
      return this;
    },

    $name(newLabel: string): This {
      core.label = newLabel;
      return this;
    },

    with<T extends AnyWgslData>(
      slot: TgpuSlot<T> | TgpuAccessor<T>,
      value: T | TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
    ): TgpuFn<Args, Return> {
      return createBoundFunction(fn, [
        [isAccessor(slot) ? slot.slot : slot, value],
      ]);
    },

    '~resolve'(ctx: ResolutionCtx): string {
      return core.resolve(ctx);
    },
  };

  const call = createDualImpl(
    (...args: unknown[]): unknown => {
      if (typeof implementation === 'string') {
        throw new Error(
          'Cannot execute on the CPU functions constructed with raw WGSL',
        );
      }

      return implementation(...args);
    },
    (...args) => {
      return {
        value: new FnCall(fn, args.map((arg) => arg.value) as Wgsl[]),
        dataType: shell.returnType ?? UnknownData,
      };
    },
  );

  Object.defineProperty(call, $internal, {
    value: {
      implementation,
    },
  });

  const fn = Object.assign(call, fnBase as This) as unknown as TgpuFn<
    Args,
    Return
  >;

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => core.label,
  });

  Object.defineProperty(fn, 'toString', {
    value: () => `fn:${core.label ?? '<unnamed>'}`,
  });

  return fn;
}

function createBoundFunction<
  Args extends AnyWgslData[],
  Return extends AnyWgslData | undefined,
>(innerFn: TgpuFn<Args, Return>, pairs: SlotValuePair[]): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return>;

  const fnBase: This = {
    resourceType: 'function',
    shell: innerFn.shell,
    '~providing': {
      inner: innerFn,
      pairs,
    },

    $uses(newExternals) {
      innerFn.$uses(newExternals);
      return this;
    },

    $name(newLabel: string): This {
      innerFn.$name(newLabel);
      return this;
    },

    with<T extends AnyWgslData>(
      slot: TgpuSlot<T> | TgpuAccessor<T>,
      value: T | TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
    ): TgpuFn<Args, Return> {
      return createBoundFunction(fn, [
        ...pairs,
        [isAccessor(slot) ? slot.slot : slot, value],
      ]);
    },
  };

  const call = createDualImpl(
    (...args: InferArgs<Args>): unknown => {
      return innerFn(...args);
    },
    (...args) => {
      return {
        value: new FnCall(fn, args.map((arg) => arg.value) as Wgsl[]),
        dataType: innerFn.shell.returnType ?? UnknownData,
      };
    },
  );

  const fn = Object.assign(call, fnBase) as TgpuFn<Args, Return>;

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => innerFn.label,
  });

  Object.defineProperty(fn, 'toString', {
    value() {
      const fnLabel = innerFn.label ?? '<unnamed>';

      return `fn:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
    },
  });

  Object.defineProperty(fn, $internal, {
    value: {
      implementation: innerFn[$internal].implementation,
    },
  });

  return fn;
}

class FnCall<Args extends AnyWgslData[], Return extends AnyWgslData | undefined>
  implements SelfResolvable
{
  constructor(
    private readonly _fn: TgpuFnBase<Args, Return>,
    private readonly _params: Wgsl[],
  ) {}

  get label() {
    return this._fn.label;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    return ctx.resolve(
      `${ctx.resolve(this._fn)}(${this._params.map((param) => ctx.resolve(param)).join(', ')})`,
    );
  }

  toString() {
    return `call:${this.label ?? '<unnamed>'}`;
  }
}
