import type { AnyData } from '../../data/dataTypes.ts';
import type { DualFn } from '../../data/dualFn.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { Void } from '../../data/wgslTypes.ts';
import { ExecutionError } from '../../errors.ts';
import { getResolutionCtx, provideInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import { isMarkedInternal } from '../../shared/symbols.ts';
import type { Infer } from '../../shared/repr.ts';
import {
  $getNameForward,
  $internal,
  $providing,
  $resolve,
} from '../../shared/symbols.ts';
import type { Prettify } from '../../shared/utilityTypes.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { TgpuBufferUsage } from '../buffer/bufferUsage.ts';
import {
  addArgTypesToExternals,
  addReturnTypeToExternals,
} from '../resolve/externals.ts';
import { stitch } from '../resolve/stitch.ts';
import {
  type Eventual,
  isAccessor,
  type Providing,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuSlot,
} from '../slot/slotTypes.ts';
import { dualImpl } from './dualImpl.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type {
  AnyFn,
  Implementation,
  InferArgs,
  InferImplSchema,
  InheritArgNames,
} from './fnTypes.ts';
import { stripTemplate } from './templateUtils.ts';
import type { TgpuBufferShorthand } from '../buffer/bufferShorthand.ts';

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
  & InferImplSchema<ImplSchema>
  & {
    readonly [$internal]:
      & DualFn<InferImplSchema<ImplSchema>>[typeof $internal]
      & {
        implementation: Implementation<ImplSchema>;
      };
  };

/**
 * A function wrapper that allows providing slot and accessor overrides for shellless functions
 */
export interface TgpuGenericFn<Callback extends AnyFn> {
  readonly [$internal]: true;
  readonly [$providing]?: Providing | undefined;
  readonly resourceType: 'generic-function';
  readonly callback: Callback;

  with<T>(slot: TgpuSlot<T>, value: Eventual<T>): TgpuGenericFn<Callback>;
  with<T extends AnyData>(
    accessor: TgpuAccessor<T>,
    value:
      | TgpuFn<() => T>
      | TgpuBufferUsage<T>
      | TgpuBufferShorthand<T>
      | Infer<T>,
  ): TgpuGenericFn<Callback>;

  (...args: Parameters<Callback>): ReturnType<Callback>;
}

export function fn<
  Args extends AnyData[] | [],
>(argTypes: Args, returnType?: undefined): TgpuFnShell<Args, Void>;

export function fn<
  Args extends AnyData[] | [],
  Return extends AnyData,
>(argTypes: Args, returnType: Return): TgpuFnShell<Args, Return>;

export function fn<Callback extends AnyFn>(
  callback: Callback,
): TgpuGenericFn<Callback>;

export function fn<
  Args extends AnyData[] | [],
  Return extends AnyData = Void,
>(
  argTypesOrCallback: Args | AnyFn,
  returnType?: Return | undefined,
): TgpuFnShell<Args, Return> | TgpuGenericFn<AnyFn> {
  if (typeof argTypesOrCallback === 'function') {
    return createGenericFn(argTypesOrCallback, []);
  }

  const argTypes = argTypesOrCallback;
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
  return isMarkedInternal(value) &&
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

  const core = createFnCore(implementation as Implementation, '');

  const fnBase = {
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

    [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
      if (typeof implementation === 'string') {
        addArgTypesToExternals(
          implementation,
          shell.argTypes,
          core.applyExternals,
        );
        addReturnTypeToExternals(
          implementation,
          shell.returnType,
          core.applyExternals,
        );
      }

      return core.resolve(ctx, shell.argTypes, shell.returnType);
    },
  } as This;

  const call = dualImpl<InferImplSchema<ImplSchema>>({
    name: 'tgpuFnCall',
    noComptime: true,
    signature: { argTypes: shell.argTypes, returnType: shell.returnType },
    normalImpl: (...args) =>
      provideInsideTgpuFn(() => {
        try {
          if (typeof implementation === 'string') {
            throw new Error(
              'Cannot execute on the CPU functions constructed with raw WGSL',
            );
          }

          const castAndCopiedArgs = args.map((arg, index) =>
            schemaCallWrapper(shell.argTypes[index] as unknown as AnyData, arg)
          ) as InferArgs<Parameters<ImplSchema>>;

          const result = implementation(...castAndCopiedArgs);
          // Casting the result to the appropriate schema
          return schemaCallWrapper(shell.returnType, result);
        } catch (err) {
          if (err instanceof ExecutionError) {
            throw err.appendToTrace(fn);
          }
          throw new ExecutionError(err, [fn]);
        }
      }),
    codegenImpl: (...args) => {
      // biome-ignore lint/style/noNonNullAssertion: it's there
      const ctx = getResolutionCtx()!;
      return ctx.withResetIndentLevel(() =>
        stitch`${ctx.resolve(fn).value}(${args})`
      );
    },
  });

  const fn = Object.assign(call, fnBase as This) as unknown as TgpuFn<
    ImplSchema
  >;
  fn[$internal].implementation = implementation;

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

  const call = dualImpl<InferImplSchema<ImplSchema>>({
    name: 'tgpuFnCall',
    noComptime: true,
    signature: {
      argTypes: innerFn.shell.argTypes,
      returnType: innerFn.shell.returnType,
    },
    normalImpl: innerFn,
    codegenImpl: (...args) => {
      // biome-ignore lint/style/noNonNullAssertion: it's there
      const ctx = getResolutionCtx()!;
      return ctx.withResetIndentLevel(() =>
        stitch`${ctx.resolve(fn).value}(${args})`
      );
    },
  });

  const fn = Object.assign(call, fnBase) as unknown as TgpuFn<ImplSchema>;
  fn[$internal].implementation = innerFn[$internal].implementation;

  Object.defineProperty(fn, 'toString', {
    value() {
      const fnLabel = getName(innerFn) ?? '<unnamed>';

      return `fn:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
    },
  });

  return fn;
}

function createGenericFn<Callback extends AnyFn>(
  callback: Callback,
  pairs: SlotValuePair[],
): TgpuGenericFn<Callback> {
  type This = TgpuGenericFn<Callback>;

  const fnBase = {
    [$internal]: true as const,
    resourceType: 'generic-function' as const,
    callback,
    [$providing]: pairs.length > 0
      ? {
        inner: callback,
        pairs,
      }
      : undefined,

    with(
      slot: TgpuSlot<unknown> | TgpuAccessor,
      value: unknown,
    ): TgpuGenericFn<Callback> {
      return createGenericFn(callback, [
        ...pairs,
        [isAccessor(slot) ? slot.slot : slot, value],
      ]);
    },
  };

  // delegate to the original callback
  const call = ((...args: Parameters<Callback>): ReturnType<Callback> => {
    return callback(...args) as ReturnType<Callback>;
  }) as Callback;

  const genericFn = Object.assign(call, fnBase) as unknown as This;

  Object.defineProperty(genericFn, 'toString', {
    value() {
      const fnLabel = getName(callback) ?? '<unnamed>';
      if (pairs.length > 0) {
        return `fn*:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
      }
      return `fn*:${fnLabel}`;
    },
  });

  return genericFn;
}
