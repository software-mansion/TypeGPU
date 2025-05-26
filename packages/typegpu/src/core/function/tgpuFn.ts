import { type AnyData, UnknownData } from '../../data/dataTypes.ts';
import { Void } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../name.ts';
import { getName, setName } from '../../name.ts';
import { createDualImpl } from '../../shared/generators.ts';
import type { Infer } from '../../shared/repr.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type { GenerationCtx } from '../../tgsl/generationHelpers.ts';
import type {
  FnArgsConversionHint,
  ResolutionCtx,
  SelfResolvable,
  Wgsl,
} from '../../types.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import {
  type Eventual,
  isAccessor,
  type Providing,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
} from '../slot/slotTypes.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type {
  Implementation,
  InferArgs,
  InferReturn,
  JsImplementation,
} from './fnTypes.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

/**
 * Describes a function signature (its arguments and return type)
 */
type TgpuFnShellHeader<
  Args extends AnyData[],
  Return extends AnyData,
> = {
  readonly [$internal]: true;
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
  Args extends AnyData[],
  Return extends AnyData,
> =
  & TgpuFnShellHeader<Args, Return>
  & ((
    implementation: (...args: InferArgs<Args>) => InferReturn<Return>,
  ) => TgpuFn<Args, Return>)
  & ((implementation: string) => TgpuFn<Args, Return>)
  & ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TgpuFn<Args, Return>)
  & {
    /**
     * @deprecated Invoke the shell as a function instead.
     */
    does:
      & ((
        implementation: (
          ...args: InferArgs<Args>
        ) => InferReturn<Return>,
      ) => TgpuFn<Args, Return>)
      & ((implementation: string) => TgpuFn<Args, Return>);
  };

interface TgpuFnBase<
  Args extends AnyData[],
  Return extends AnyData,
> extends TgpuNamable {
  readonly [$internal]: {
    implementation: Implementation<Args, Return>;
    argTypes: FnArgsConversionHint;
  };
  readonly resourceType: 'function';
  readonly shell: TgpuFnShellHeader<Args, Return>;
  readonly '~providing'?: Providing | undefined;

  $uses(dependencyMap: Record<string, unknown>): this;
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TgpuFn<Args, Return>;
  with<T extends AnyData>(
    accessor: TgpuAccessor<T>,
    value: TgpuFn<[], T> | TgpuBufferUsage<T> | Infer<T>,
  ): TgpuFn<Args, Return>;
}

export type TgpuFn<
  Args extends AnyData[] = AnyData[],
  Return extends AnyData = AnyData,
> =
  & TgpuFnBase<Args, Return>
  & ((...args: InferArgs<Args>) => InferReturn<Return>);

export function fn<
  Args extends AnyData[] | [],
>(argTypes: Args, returnType?: undefined): TgpuFnShell<Args, Void>;

export function fn<
  Args extends AnyData[] | [],
  Return extends AnyData,
>(argTypes: Args, returnType: Return): TgpuFnShell<Args, Return>;

export function fn<
  Args extends AnyData[] | [],
  Return extends AnyData = Void,
>(argTypes: Args, returnType?: Return | undefined): TgpuFnShell<Args, Return> {
  const shell: TgpuFnShellHeader<Args, Return> = {
    [$internal]: true,
    argTypes,
    returnType: returnType ?? Void as Return,
    isEntry: false,
  };

  const call = (
    arg: Implementation | TemplateStringsArray,
    ...values: unknown[]
  ) => createFn(shell, stripTemplate(arg, ...values));

  return Object.assign(Object.assign(call, shell), {
    does: call,
  }) as TgpuFnShell<Args, Return>;
}

export function isTgpuFn<Args extends AnyData[], Return extends AnyData>(
  value: unknown | TgpuFn<Args, Return>,
): value is TgpuFn<Args, Return> {
  return !!(value as TgpuFn<Args, Return>)?.[$internal] &&
    (value as TgpuFn<Args, Return>)?.resourceType === 'function';
}

// --------------
// Implementation
// --------------

function stringifyPair([slot, value]: SlotValuePair): string {
  return `${getName(slot) ?? '<unnamed>'}=${value}`;
}

function createFn<Args extends AnyData[], Return extends AnyData>(
  shell: TgpuFnShellHeader<Args, Return>,
  implementation: Implementation<Args, Return>,
): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return> & SelfResolvable & {
    [$getNameForward]: FnCore;
  };

  const core = createFnCore(shell, implementation as Implementation);

  const fnBase: This = {
    [$internal]: {
      implementation,
      argTypes: shell.argTypes,
    },
    shell,
    resourceType: 'function' as const,

    $uses(newExternals: Record<string, unknown>) {
      core.applyExternals(newExternals);
      return this;
    },

    [$getNameForward]: core,
    $name(label: string): This {
      setName(core, label);
      return this;
    },

    with(
      slot: TgpuSlot<unknown> | TgpuAccessor,
      value: unknown,
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

  const call = createDualImpl<JsImplementation<Args, Return>>(
    (...args) => {
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
    shell.argTypes,
  );

  call[$internal].implementation = implementation;

  const fn = Object.assign(call, fnBase as This) as unknown as TgpuFn<
    Args,
    Return
  >;

  Object.defineProperty(fn, 'toString', {
    value() {
      return `fn:${getName(core) ?? '<unnamed>'}`;
    },
  });

  return fn;
}

function createBoundFunction<Args extends AnyData[], Return extends AnyData>(
  innerFn: TgpuFn<Args, Return>,
  pairs: SlotValuePair[],
): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return> & {
    [$getNameForward]: TgpuFn<Args, Return>;
  };

  const fnBase: This = {
    [$internal]: {
      implementation: innerFn[$internal].implementation,
      argTypes: innerFn[$internal].argTypes,
    },
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

    [$getNameForward]: innerFn,
    $name(label: string): This {
      innerFn.$name(label);
      return this;
    },

    with(
      slot: TgpuSlot<unknown> | TgpuAccessor,
      value: unknown,
    ): TgpuFn<Args, Return> {
      return createBoundFunction(fn, [
        ...pairs,
        [isAccessor(slot) ? slot.slot : slot, value],
      ]);
    },
  };

  const call = createDualImpl(
    (...args: InferArgs<Args>): unknown => innerFn(...args),
    (...args) => {
      return {
        value: new FnCall(fn, args.map((arg) => arg.value) as Wgsl[]),
        dataType: innerFn.shell.returnType ?? UnknownData,
      };
    },
    innerFn.shell.argTypes,
  );

  const fn = Object.assign(call, fnBase) as TgpuFn<Args, Return>;

  Object.defineProperty(fn, 'toString', {
    value() {
      const fnLabel = getName(innerFn) ?? '<unnamed>';

      return `fn:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
    },
  });

  fn[$internal].implementation = innerFn[$internal].implementation;

  return fn;
}

class FnCall<Args extends AnyData[], Return extends AnyData>
  implements SelfResolvable {
  readonly [$getNameForward]: TgpuFnBase<Args, Return>;

  constructor(
    private readonly _fn: TgpuFnBase<Args, Return>,
    private readonly _params: Wgsl[],
  ) {
    this[$getNameForward] = _fn;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    return ctx.resolve(
      `${ctx.resolve(this._fn)}(${
        this._params.map((param) => ctx.resolve(param)).join(', ')
      })`,
    );
  }

  toString() {
    return `call:${getName(this) ?? '<unnamed>'}`;
  }
}
