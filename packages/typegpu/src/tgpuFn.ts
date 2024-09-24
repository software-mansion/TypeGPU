import type { Unwrap } from 'typed-binary';
import { inGPUMode } from './gpuMode';
import { type TgpuNamable, isNamable } from './namable';
import { valueList } from './resolutionUtils';
import { code } from './tgpuCode';
import { identifier } from './tgpuIdentifier';
import {
  type AnyTgpuData,
  type ResolutionCtx,
  type TgpuResolvable,
  type Wgsl,
  isWgsl,
} from './types';

// ----------
// Public API
// ----------

type AnyTgpuDataTuple = [AnyTgpuData, ...AnyTgpuData[]] | [];
type UnwrapArgs<T extends AnyTgpuDataTuple> = {
  [Idx in keyof T]: Unwrap<T[Idx]>;
};
type UnwrapReturn<T extends AnyTgpuData | undefined> = T extends undefined
  ? // biome-ignore lint/suspicious/noConfusingVoidType: <void is used as a return type>
    void
  : Unwrap<T>;

/**
 * Describes a function signature (its arguments and return type)
 */
interface TgpuFnShell<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;

  /**
   * Creates a type-safe implementation of this signature
   */
  implement(
    body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ): TgpuFn<Args, Return>;
}

interface TgpuFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;
  /** The JS function body passed as an implementation of a TypeGPU function. */
  readonly body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>;
  readonly bodyResolvable: TgpuResolvable;

  $uses(dependencyMap: Record<string, unknown>): this;
}

interface TgpuRawFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;
  /** The JS function body passed as an implementation of a TypeGPU function. */
  readonly body: Wgsl;
  readonly bodyResolvable: TgpuResolvable;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export type TgpuFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> = (TgpuFnBase<Args, Return> | TgpuRawFnBase<Args, Return>) &
  ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>);

export function fn<Args extends AnyTgpuDataTuple>(): TgpuFnShell<[], undefined>;

export function fn<Return extends AnyTgpuData>(
  returnType: Return,
): TgpuFnShell<[], Return>;

export function fn<Args extends AnyTgpuDataTuple>(
  argTypes: Args,
  returnType?: undefined,
): TgpuFnShell<Args, undefined>;

export function fn<Args extends AnyTgpuDataTuple, Return extends AnyTgpuData>(
  argTypes: Args,
  returnType: Return,
): TgpuFnShell<Args, Return>;

export function fn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
>(first?: Args | Return, second?: Return): TgpuFnShell<Args, Return> {
  if (Array.isArray(first)) {
    return new TgpuFnShellImpl((first ?? []) as Args, second as Return);
  }

  // If only one argument and it is not an array, it is the return type.
  return new TgpuFnShellImpl([] as Args, first as Return);
}

export function procedure(body: () => void) {
  return fn().implement(body);
}

// --------------
// Implementation
// --------------

class TgpuFnShellImpl<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> implements TgpuFnShell<Args, Return>
{
  constructor(
    public readonly argTypes: Args,
    public readonly returnType: Return,
  ) {}

  implement(
    body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return> | Wgsl,
  ): TgpuFn<Args, Return> {
    if (isWgsl(body)) {
      return createRawFn<Args, Return>(this, body);
    }
    return createFn<Args, Return>(
      this,
      body as (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
    );
  }
}

function createFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  body: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
): TgpuFn<Args, Return> {
  let label: string | undefined;
  const externalMap: Record<string, unknown> = {};

  const fnBase: TgpuFnBase<Args, Return> = {
    shell,
    body,

    bodyResolvable: {
      get label() {
        return `${label}.body`;
      },

      resolve: (ctx) => {
        const { body } = ctx.fnToWgsl(
          fnBase as TgpuFn<Args, Return>,
          externalMap,
        );
        return ctx.resolve(body);
      },
    } satisfies TgpuResolvable,

    $uses(newExternals) {
      for (const [key, value] of Object.entries(newExternals)) {
        externalMap[key] = value;

        // Giving name to external value
        if (isNamable(value)) {
          value.$name(key);
        }
      }
      return this;
    },

    get label() {
      return label;
    },

    $name(newLabel: string): TgpuFnBase<Args, Return> {
      label = newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(this.label);

      const { head, body } = ctx.fnToWgsl(
        this as TgpuFn<Args, Return>,
        externalMap,
      );
      ctx.addDeclaration(code`fn ${ident}${head}${body}`);

      return ctx.resolve(ident);
    },
  };

  const call = (...args: UnwrapArgs<Args>): UnwrapReturn<Return> => {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(fnBase, args as Wgsl[]) as UnwrapReturn<Return>;
    }

    return fnBase.body(...args);
  };

  return Object.assign(call, fnBase);
}

function createRawFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
>(shell: TgpuFnShell<Args, Return>, body: Wgsl): TgpuFn<Args, Return> {
  let label: string | undefined;
  const externalMap: Record<string, unknown> = {};

  const fnBase: TgpuRawFnBase<Args, Return> = {
    shell,
    body,

    bodyResolvable: {
      get label() {
        return `${label}.body`;
      },

      resolve: (ctx) => {
        return ctx.resolve(body);
      },
    } satisfies TgpuResolvable,

    $uses(newExternals) {
      for (const [key, value] of Object.entries(newExternals)) {
        externalMap[key] = value;

        // Giving name to external value
        if (isNamable(value)) {
          value.$name(key);
        }
      }
      return this;
    },

    get label() {
      return label;
    },

    $name(newLabel: string): TgpuRawFnBase<Args, Return> {
      label = newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(this.label);

      ctx.addDeclaration(this.bodyResolvable);

      return ctx.resolve(ident);
    },
  };

  const call = (...args: UnwrapArgs<Args>): UnwrapReturn<Return> => {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(fnBase, args as Wgsl[]) as UnwrapReturn<Return>;
    }

    throw new Error('Cannot execute functions constructed with raw WGSL');
  };

  return Object.assign(call, fnBase);
}

class FnCall<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> implements TgpuResolvable
{
  constructor(
    private readonly _fn:
      | TgpuFnBase<Args, Return>
      | TgpuRawFnBase<Args, Return>,
    private readonly _params: Wgsl[],
  ) {}

  get label() {
    return this._fn.label;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.resolve(code`${this._fn}(${valueList(this._params)})`);
  }
}
