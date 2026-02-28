import type { ResolvedSnippet } from '../../data/snippet.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { type BaseData, Void } from '../../data/wgslTypes.ts';
import { ExecutionError } from '../../errors.ts';
import { provideInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import { isMarkedInternal } from '../../shared/symbols.ts';
import type { Infer } from '../../shared/repr.ts';
import { $getNameForward, $internal, $providing, $resolve } from '../../shared/symbols.ts';
import type { Prettify } from '../../shared/utilityTypes.ts';
import type { DualFn, ResolutionCtx, SelfResolvable } from '../../types.ts';
import { addArgTypesToExternals, addReturnTypeToExternals } from '../resolve/externals.ts';
import { stitch } from '../resolve/stitch.ts';
import {
  isAccessor,
  isMutableAccessor,
  type Providing,
  type SlotValuePair,
  type TgpuAccessor,
  type TgpuMutableAccessor,
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
import { comptime } from './comptime.ts';
import type { Withable } from '../root/rootTypes.ts';

// ----------
// Public API
// ----------

/**
 * Describes a function signature (its arguments and return type)
 */
type TgpuFnShellHeader<Args extends BaseData[], Return extends BaseData> = {
  readonly [$internal]: true;
  readonly argTypes: Args;
  readonly returnType: Return;
};

/**
 * Describes a function signature (its arguments and return type).
 * Allows creating tgpu functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuFnShell<Args extends BaseData[], Return extends BaseData> = TgpuFnShellHeader<
  Args,
  Return
> &
  (<T extends (...args: InferArgs<Args>) => Infer<Return>>(
    implementation: T,
  ) => TgpuFn<Prettify<InheritArgNames<(...args: Args) => Return, T>>['result']>) &
  ((implementation: string) => TgpuFn<(...args: Args) => Return>) &
  ((strings: TemplateStringsArray, ...values: unknown[]) => TgpuFn<(...args: Args) => Return>);

interface TgpuFnBase<ImplSchema extends AnyFn> extends TgpuNamable, Withable<TgpuFn<ImplSchema>> {
  [$internal]: {
    implementation: Implementation<ImplSchema>;
  };
  readonly resourceType: 'function';
  readonly shell: TgpuFnShellHeader<
    Parameters<ImplSchema>,
    Extract<ReturnType<ImplSchema>, BaseData>
  >;
  readonly [$providing]?: Providing | undefined;

  $uses(dependencyMap: Record<string, unknown>): this;
}

// oxlint-disable-next-line typescript/no-explicit-any -- the widest type requires `any`
export type TgpuFn<ImplSchema extends AnyFn = (...args: any[]) => any> = DualFn<
  InferImplSchema<ImplSchema>
> &
  TgpuFnBase<ImplSchema>;

/**
 * A function wrapper that allows providing slot and accessor overrides for shellless functions
 */
export interface TgpuGenericFn<T extends AnyFn> extends TgpuNamable, Withable<TgpuGenericFn<T>> {
  readonly [$internal]: {
    inner: T;
  };
  readonly [$providing]?: Providing | undefined;
  readonly resourceType: 'generic-function';

  (...args: Parameters<T>): ReturnType<T>;
}

export function fn<Args extends BaseData[] | []>(
  argTypes: Args,
  returnType?: undefined,
): TgpuFnShell<Args, Void>;

export function fn<Args extends BaseData[] | [], Return extends BaseData>(
  argTypes: Args,
  returnType: Return,
): TgpuFnShell<Args, Return>;

export function fn<T extends AnyFn>(inner: T): TgpuGenericFn<T>;

export function fn<Args extends BaseData[] | [], Return extends BaseData = Void>(
  argTypesOrCallback: Args | AnyFn,
  returnType?: Return,
): TgpuFnShell<Args, Return> | TgpuGenericFn<AnyFn> {
  if (typeof argTypesOrCallback === 'function') {
    return createGenericFn(argTypesOrCallback, []);
  }

  const argTypes = argTypesOrCallback;
  const shell: TgpuFnShellHeader<Args, Return> = {
    [$internal]: true,
    argTypes,
    returnType: returnType ?? (Void as unknown as Return),
  };

  const call = (arg: Implementation | TemplateStringsArray, ...values: unknown[]) =>
    createFn(shell as unknown as TgpuFnShellHeader<never[], never>, stripTemplate(arg, ...values));

  return Object.assign(call, shell) as unknown as TgpuFnShell<Args, Return>;
}

export function isTgpuFn<Args extends BaseData[] | [], Return extends BaseData>(
  value: unknown,
): value is TgpuFn<(...args: Args) => Return> {
  return (
    isMarkedInternal(value) &&
    (value as TgpuFn<(...args: Args) => Return>)?.resourceType === 'function'
  );
}

export function isGenericFn<Callback extends AnyFn>(
  value: unknown,
): value is TgpuGenericFn<Callback> {
  return (
    isMarkedInternal(value) &&
    (value as TgpuGenericFn<Callback>)?.resourceType === 'generic-function'
  );
}

// --------------
// Implementation
// --------------

function stringifyPair([slot, value]: SlotValuePair): string {
  return `${getName(slot) ?? '<unnamed>'}=${value}`;
}

function createFn<ImplSchema extends AnyFn>(
  shell: TgpuFnShellHeader<Parameters<ImplSchema>, Extract<ReturnType<ImplSchema>, BaseData>>,
  _implementation: Implementation<ImplSchema>,
): TgpuFn<ImplSchema> {
  type This = TgpuFnBase<ImplSchema> &
    SelfResolvable & {
      [$getNameForward]: FnCore;
    };

  let pairs: SlotValuePair[] = [];
  // Unwrapping generic functions
  let implementation: Implementation<ImplSchema>;
  if (isGenericFn(_implementation)) {
    pairs = _implementation[$providing]?.pairs ?? [];
    implementation = _implementation[$internal].inner as typeof implementation;
  } else {
    implementation = _implementation;
  }

  const core = createFnCore(implementation as Implementation, '');

  const fnBase = {
    shell,
    resourceType: 'function' as const,
    [$internal]: { implementation },

    $uses(newExternals: Record<string, unknown>) {
      core.applyExternals(newExternals);
      return this;
    },

    [$getNameForward]: core,
    $name(label: string): This {
      setName(this, label);
      return this;
    },

    with: comptime(
      (
        slot: TgpuSlot<unknown> | TgpuAccessor | TgpuMutableAccessor,
        value: unknown,
      ): TgpuFn<ImplSchema> => {
        const s = isAccessor(slot) || isMutableAccessor(slot) ? slot.slot : slot;
        return createBoundFunction(fn, [[s, value]]);
      },
    ) as TgpuFn['with'],

    [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
      if (typeof implementation === 'string') {
        addArgTypesToExternals(implementation, shell.argTypes, core.applyExternals);
        addReturnTypeToExternals(implementation, shell.returnType, core.applyExternals);
      }

      return core.resolve(ctx, shell.argTypes, shell.returnType);
    },
  } as This;

  const call = dualImpl<InferImplSchema<ImplSchema>>({
    name: undefined, // the name is forwarded to the core anyway
    noComptime: true,
    signature: { argTypes: shell.argTypes, returnType: shell.returnType },
    normalImpl: (...args) =>
      provideInsideTgpuFn(() => {
        try {
          if (typeof implementation === 'string') {
            throw new Error('Cannot execute on the CPU functions constructed with raw WGSL');
          }

          const castAndCopiedArgs = args.map((arg, index) =>
            schemaCallWrapper(shell.argTypes[index] as unknown as BaseData, arg),
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
    codegenImpl: (ctx, args) =>
      ctx.withResetIndentLevel(() => stitch`${ctx.resolve(fn).value}(${args})`),
  });

  const fn = Object.assign(call, fnBase) as TgpuFn<ImplSchema>;

  Object.defineProperty(fn, 'toString', {
    value() {
      return `fn:${getName(core) ?? '<unnamed>'}`;
    },
  });

  if (pairs.length > 0) {
    return createBoundFunction(fn, pairs);
  }
  return fn;
}

function createBoundFunction<ImplSchema extends AnyFn>(
  innerFn: TgpuFn<ImplSchema>,
  pairs: SlotValuePair[],
): TgpuFn<ImplSchema> {
  type This = TgpuFnBase<ImplSchema>;

  const fnBase: This = {
    resourceType: 'function',
    shell: innerFn.shell,
    [$internal]: { implementation: innerFn[$internal].implementation },
    [$providing]: { inner: innerFn, pairs },

    $uses(newExternals) {
      innerFn.$uses(newExternals);
      return this;
    },

    $name(label: string): This {
      setName(this, label);
      return this;
    },

    with: comptime(
      (
        slot: TgpuSlot<unknown> | TgpuAccessor | TgpuMutableAccessor,
        value: unknown,
      ): TgpuFn<ImplSchema> => {
        const s = isAccessor(slot) || isMutableAccessor(slot) ? slot.slot : slot;
        return createBoundFunction(innerFn, [...pairs, [s, value]]);
      },
    ),
  };

  const call = dualImpl<InferImplSchema<ImplSchema>>({
    name: undefined, // setting name here would override autonaming
    noComptime: true,
    signature: {
      argTypes: innerFn.shell.argTypes,
      returnType: innerFn.shell.returnType,
    },
    normalImpl: innerFn,
    codegenImpl: (ctx, args) =>
      ctx.withResetIndentLevel(() => stitch`${ctx.resolve(fn).value}(${args})`),
  });

  const fn = Object.assign(call, fnBase) as TgpuFn<ImplSchema>;

  Object.defineProperty(fn, 'toString', {
    value() {
      const fnLabel = getName(this) ?? '<unnamed>';

      return `fn:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
    },
  });

  const innerName = getName(innerFn);
  if (innerName) {
    setName(fn, innerName);
  }

  return fn;
}

function createGenericFn<T extends AnyFn>(inner: T, pairs: SlotValuePair[]): TgpuGenericFn<T> {
  const fnBase = {
    [$internal]: { inner },
    resourceType: 'generic-function' as const,
    [$providing]: pairs.length > 0 ? { inner, pairs } : undefined,

    $name(label: string): TgpuGenericFn<T> {
      setName(this, label);
      // Giving `inner` a name if it doesn't have one
      if (!getName(inner)) {
        setName(inner, label);
      }
      return this as TgpuGenericFn<T>;
    },

    with(
      slot: TgpuSlot<unknown> | TgpuAccessor | TgpuMutableAccessor,
      value: unknown,
    ): TgpuGenericFn<T> {
      const s = isAccessor(slot) || isMutableAccessor(slot) ? slot.slot : slot;
      return createGenericFn(inner, [...pairs, [s, value]]);
    },
  };

  const call = (...args: Parameters<T>): ReturnType<T> => {
    return inner(...args) as ReturnType<T>;
  };

  const genericFn = Object.assign(call, fnBase) as unknown as TgpuGenericFn<T>;

  // Inheriting name from `inner`, if it exists
  if (getName(inner)) {
    setName(genericFn, getName(inner));
  }

  Object.defineProperty(genericFn, 'toString', {
    value() {
      const fnLabel = getName(genericFn) ?? '<unnamed>';
      if (pairs.length > 0) {
        return `fn*:${fnLabel}[${pairs.map(stringifyPair).join(', ')}]`;
      }
      return `fn*:${fnLabel}`;
    },
  });
  return genericFn;
}
