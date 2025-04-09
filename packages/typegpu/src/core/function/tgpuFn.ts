import type { AnyWgslData } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../namable.ts';
import { createDualImpl } from '../../shared/generators.ts';
import type { Infer } from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type { GenerationCtx } from '../../smol/wgslGenerator.ts';
import {
  type Labelled,
  type ResolutionCtx,
  type SelfResolvable,
  UnknownData,
  type Wgsl,
} from '../../types.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import {
  type Eventual,
  type Providing,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
  isAccessor,
} from '../slot/slotTypes.ts';
import { createFnCore } from './fnCore.ts';
import type {
  Implementation,
  InferArgs,
  InferIO,
  InferReturn,
} from './fnTypes.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

/**
 * Describes a function signature (its arguments and return type)
 */
type TgpuFnShellHeader<
  Args extends AnyWgslData[] | Record<string, AnyWgslData>,
  Return extends AnyWgslData | undefined = AnyWgslData | undefined,
> = {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;
  readonly isEntry: false;
};

/**
 * Describes a function signature (its arguments and return type).
 * Allows creating tgpu functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuFnShell<
  Args extends AnyWgslData[] | Record<string, AnyWgslData>,
  Return extends AnyWgslData | undefined = AnyWgslData | undefined,
> = TgpuFnShellHeader<Args, Return> &
  ((
    implementation: (
      ...args: Args extends AnyWgslData[] ? InferArgs<Args> : [InferIO<Args>]
    ) => InferReturn<Return>,
  ) => TgpuFn<Args, Return>) &
  ((implementation: string) => TgpuFn<Args, Return>) &
  ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TgpuFn<Args, Return>) & {
    /**
     * @deprecated Invoke the shell as a function instead.
     */
    does: ((
      implementation: (
        ...args: Args extends AnyWgslData[] ? InferArgs<Args> : [InferIO<Args>]
      ) => InferReturn<Return>,
    ) => TgpuFn<Args, Return>) &
      ((implementation: string) => TgpuFn<Args, Return>);
  };

interface TgpuFnBase<
  Args extends AnyWgslData[] | Record<string, AnyWgslData>,
  Return extends AnyWgslData | undefined = undefined,
> extends TgpuNamable,
    Labelled {
  readonly resourceType: 'function';
  readonly shell: TgpuFnShellHeader<Args, Return>;
  readonly '~providing'?: Providing | undefined;

  $uses(dependencyMap: Record<string, unknown>): this;
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TgpuFn<Args, Return>;
  with<T extends AnyWgslData>(
    accessor: TgpuAccessor<T>,
    value: TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
  ): TgpuFn<Args, Return>;
}

export type TgpuFn<
  Args extends AnyWgslData[] | Record<string, AnyWgslData> = AnyWgslData[],
  Return extends AnyWgslData | undefined = AnyWgslData | undefined,
> = TgpuFnBase<Args, Return> &
  ((
    ...args: Args extends AnyWgslData[]
      ? InferArgs<Args>
      : Args extends Record<string, never>
        ? []
        : [InferIO<Args>]
  ) => InferReturn<Return>) & {
    readonly [$internal]: {
      implementation: Implementation<
        Args extends AnyWgslData[]
          ? InferArgs<Args>
          : Args extends Record<string, never>
            ? []
            : [InferIO<Args>],
        InferReturn<Return>
      >;
    };
  };

export function fn<
  Args extends AnyWgslData[] | Record<string, AnyWgslData> | [],
>(argTypes: Args, returnType?: undefined): TgpuFnShell<Args, undefined>;

export function fn<
  Args extends AnyWgslData[] | Record<string, AnyWgslData> | [],
  Return extends AnyWgslData,
>(argTypes: Args, returnType: Return): TgpuFnShell<Args, Return>;

export function fn<
  Args extends AnyWgslData[] | Record<string, AnyWgslData> | [],
  Return extends AnyWgslData | undefined = undefined,
>(argTypes: Args, returnType?: Return): TgpuFnShell<Args, Return> {
  const shell: TgpuFnShellHeader<Args, Return> = {
    argTypes,
    returnType,
    isEntry: false,
  };

  const call = (
    arg: Implementation | TemplateStringsArray,
    ...values: unknown[]
  ) =>
    createFn(
      shell,
      stripTemplate(arg as Implementation | TemplateStringsArray, ...values),
    );

  return Object.assign(Object.assign(call, shell), {
    does: call,
  }) as TgpuFnShell<Args, Return>;
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
  Args extends AnyWgslData[] | Record<string, AnyWgslData>,
  Return extends AnyWgslData | undefined,
>(
  shell: TgpuFnShellHeader<Args, Return>,
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
      if (typeof implementation === 'string') {
        return core.resolve(ctx);
      }

      const generationCtx = ctx as GenerationCtx;
      if (generationCtx.callStack === undefined) {
        throw new Error(
          'Cannot resolve a TGSL function outside of a generation context',
        );
      }

      try {
        generationCtx.callStack.push(shell.returnType);
        return core.resolve(ctx);
      } finally {
        generationCtx.callStack.pop();
      }
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
    (...args) => ({
      value: new FnCall(fn, args.map((arg) => arg.value) as Wgsl[]),
      dataType: shell.returnType ?? UnknownData,
    }),
  );

  call[$internal].implementation = implementation;

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
  Args extends AnyWgslData[] | Record<string, AnyWgslData>,
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
    (
      ...args: Args extends AnyWgslData[]
        ? InferArgs<Args>
        : Args extends Record<string, never>
          ? []
          : [InferIO<Args>]
    ): unknown => innerFn(...args),
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

  fn[$internal].implementation = innerFn[$internal].implementation;

  return fn;
}

class FnCall<
  Args extends AnyWgslData[] | Record<string, AnyWgslData>,
  Return extends AnyWgslData | undefined,
> implements SelfResolvable
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
