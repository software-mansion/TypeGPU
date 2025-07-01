import { type AnyData, snip, UnknownData } from '../../data/dataTypes.ts';
import { Void } from '../../data/wgslTypes.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import { createDualImpl } from '../../shared/generators.ts';
import type { Infer } from '../../shared/repr.ts';
import {
  $getNameForward,
  $internal,
  $providing,
} from '../../shared/symbols.ts';
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
  AnyFn,
  Implementation,
  InferArgs,
  InferImplSchema,
  InheritArgNames,
} from './fnTypes.ts';
import { stripTemplate } from './templateUtils.ts';
import type { Prettify } from '../../shared/utilityTypes.ts';

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
  readonly returnType: Return;
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
  & (<T extends (...args: InferArgs<Args>) => Infer<Return>>(
    implementation: T,
  ) => TgpuFn<
    Prettify<InheritArgNames<(...args: Args) => Return, T>>['result']
  >)
  & ((implementation: string) => TgpuFn<(...args: Args) => Return>)
  & ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TgpuFn<(...args: Args) => Return>);

interface TgpuFnBase<ImplSchema extends AnyFn> extends TgpuNamable {
  readonly [$internal]: {
    implementation: Implementation<ImplSchema>;
    argTypes: FnArgsConversionHint;
  };
  readonly resourceType: 'function';
  readonly shell: TgpuFnShellHeader<
    Parameters<ImplSchema>,
    Extract<ReturnType<ImplSchema>, AnyData>
  >;
  readonly [$providing]?: Providing | undefined;

  $uses(dependencyMap: Record<string, unknown>): this;
  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TgpuFn<ImplSchema>;
  with<T extends AnyData>(
    accessor: TgpuAccessor<T>,
    value: TgpuFn<() => T> | TgpuBufferUsage<T> | Infer<T>,
  ): TgpuFn<ImplSchema>;
}

// biome-ignore lint/suspicious/noExplicitAny: the widest type requires `any`
export type TgpuFn<ImplSchema extends AnyFn = (...args: any[]) => any> =
  & TgpuFnBase<ImplSchema>
  & InferImplSchema<ImplSchema>;

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
  ) =>
    createFn(
      shell as unknown as TgpuFnShellHeader<never[], never>,
      stripTemplate(arg, ...values),
    );

  return Object.assign(call, shell) as unknown as TgpuFnShell<Args, Return>;
}

export function isTgpuFn<Args extends AnyData[] | [], Return extends AnyData>(
  value: unknown | TgpuFn<(...args: Args) => Return>,
): value is TgpuFn<(...args: Args) => Return> {
  return !!(value as TgpuFn<(...args: Args) => Return>)?.[$internal] &&
    (value as TgpuFn<(...args: Args) => Return>)?.resourceType === 'function';
}

// --------------
// Implementation
// --------------

function stringifyPair([slot, value]: SlotValuePair): string {
  return `${getName(slot) ?? '<unnamed>'}=${value}`;
}

function createFn<ImplSchema extends AnyFn>(
  shell: TgpuFnShellHeader<
    Parameters<ImplSchema>,
    Extract<ReturnType<ImplSchema>, AnyData>
  >,
  implementation: Implementation<ImplSchema>,
): TgpuFn<ImplSchema> {
  type This = TgpuFnBase<ImplSchema> & SelfResolvable & {
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
    ): TgpuFn<ImplSchema> {
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

  const call = createDualImpl<InferImplSchema<ImplSchema>>(
    (...args) => {
      if (typeof implementation === 'string') {
        throw new Error(
          'Cannot execute on the CPU functions constructed with raw WGSL',
        );
      }

      return implementation(...args);
    },
    (...args) =>
      snip(
        new FnCall(fn, args.map((arg) => arg.value) as Wgsl[]),
        shell.returnType ?? UnknownData,
      ),
    'tgpuFnCall',
    shell.argTypes,
  );

  call[$internal].implementation = implementation;

  const fn = Object.assign(call, fnBase as This) as unknown as TgpuFn<
    ImplSchema
  >;

  Object.defineProperty(fn, 'toString', {
    value() {
      return `fn:${getName(core) ?? '<unnamed>'}`;
    },
  });

  return fn;
}

function createBoundFunction<ImplSchema extends AnyFn>(
  innerFn: TgpuFn<ImplSchema>,
  pairs: SlotValuePair[],
): TgpuFn<ImplSchema> {
  type This = TgpuFnBase<ImplSchema> & {
    [$getNameForward]: TgpuFn<ImplSchema>;
  };

  const fnBase: This = {
    [$internal]: {
      implementation: innerFn[$internal].implementation,
      argTypes: innerFn[$internal].argTypes,
    },
    resourceType: 'function',
    shell: innerFn.shell,
    [$providing]: {
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
    ): TgpuFn<ImplSchema> {
      return createBoundFunction(fn, [
        ...pairs,
        [isAccessor(slot) ? slot.slot : slot, value],
      ]);
    },
  };

  const call = createDualImpl<InferImplSchema<ImplSchema>>(
    (...args) => innerFn(...args),
    (...args) =>
      snip(
        new FnCall(fn, args.map((arg) => arg.value) as Wgsl[]),
        innerFn.shell.returnType ?? UnknownData,
      ),
    'tgpuFnCall',
    innerFn.shell.argTypes as AnyData[],
  );

  const fn = Object.assign(call, fnBase) as TgpuFn<ImplSchema>;

  Object.defineProperty(fn, 'toString', {
    value() {
      const fnLabel = getName(innerFn) ?? '<unnamed>';

      return `fn:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
    },
  });

  fn[$internal].implementation = innerFn[$internal].implementation;

  return fn;
}

class FnCall<ImplSchema extends AnyFn> implements SelfResolvable {
  readonly [$getNameForward]: TgpuFnBase<ImplSchema>;

  constructor(
    private readonly _fn: TgpuFnBase<ImplSchema>,
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
