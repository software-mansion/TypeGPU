import type { Unwrap } from 'typed-binary';
import { inGPUMode } from './gpuMode';
import { type TgpuNamable, isNamable } from './namable';
import { valueList } from './resolutionUtils';
import type { Block } from './smol';
import { code } from './tgpuCode';
import { identifier } from './tgpuIdentifier';
import {
  type AnyTgpuData,
  type ResolutionCtx,
  type TgpuResolvable,
  type Wgsl,
  isResolvable,
} from './types';
import wgsl from './wgsl';

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
export interface TgpuFnShell<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;

  /**
   * Creates a type-safe implementation of this signature
   */
  implement(
    implementation: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ): TgpuFn<Args, Return>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  implement(implementation: string): TgpuFn<Args, Return>;
}

interface TgpuTgslFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;
  /** The JS function body passed as an implementation of a TypeGPU function. */
  readonly implementation: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>;
  readonly bodyResolvable: TgpuResolvable;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

interface TgpuRawFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;
  /** The WGSL function header and body passed as raw string. */
  readonly implementation: string;

  $uses(dependencyMap: Record<string, unknown>): this;
}

type TgpuFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> = TgpuTgslFnBase<Args, Return> | TgpuRawFnBase<Args, Return>;

export type TgpuTgslFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> = TgpuTgslFnBase<Args, Return> &
  ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>);

export type TgpuRawFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> = TgpuRawFnBase<Args, Return> &
  ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>);

export type TgpuFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> = TgpuTgslFn<Args, Return> | TgpuRawFn<Args, Return>;

export function isTgslFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
>(fn: TgpuFn<Args, Return>): fn is TgpuTgslFn<Args, Return> {
  return 'bodyResolvable' in fn;
}

export function isRawFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
>(fn: TgpuFn<Args, Return>): fn is TgpuRawFn<Args, Return> {
  return !isTgslFn(fn);
}

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

export function procedure(implementation: () => void) {
  return fn().implement(implementation);
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
    implementation:
      | ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>)
      | string,
  ): TgpuFn<Args, Return> {
    if (typeof implementation === 'string') {
      return createRawFn<Args, Return>(this, implementation);
    }
    return createFn<Args, Return>(this, implementation);
  }
}

function createFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  implementation: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
): TgpuFn<Args, Return> {
  const externalMap: Record<string, unknown> = {};
  let prebuiltAst: { argNames: string[]; body: Block } | null = null;
  let label: string | undefined;

  const fnBase: TgpuTgslFnBase<Args, Return> = {
    shell,
    implementation,

    bodyResolvable: {
      get label() {
        return `${label}.implementation`;
      },

      resolve: (ctx) => {
        const ast = prebuiltAst ?? ctx.transpileFn(fn);
        const { body } = ctx.fnToWgsl(
          fn.shell,
          ast.argNames,
          ast.body,
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

    $__ast(argNames: string[], body: Block): TgpuTgslFnBase<Args, Return> {
      prebuiltAst = { argNames, body };
      return this;
    },

    $name(newLabel: string): TgpuTgslFnBase<Args, Return> {
      // Can only set the name once, other calls are ignored.
      label = label ?? newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(label);

      const ast = prebuiltAst ?? ctx.transpileFn(fn);
      const { head, body } = ctx.fnToWgsl(
        fn.shell,
        ast.argNames,
        ast.body,
        externalMap,
      );
      ctx.addDeclaration(code`fn ${ident}${head}${body}`);

      return ctx.resolve(ident);
    },
  };

  const call = (...args: UnwrapArgs<Args>): UnwrapReturn<Return> => {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(fn, args as Wgsl[]) as UnwrapReturn<Return>;
    }

    return fn.implementation(...args);
  };

  const fn = Object.assign(call, fnBase);

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => label,
  });

  return fn;
}

function createRawFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  implementation: string,
): TgpuRawFn<Args, Return> {
  const externalMap: Record<string, unknown> = {};
  let label: string | undefined;

  const fnBase: TgpuRawFnBase<Args, Return> = {
    shell,
    implementation,

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

    $name(newLabel: string): TgpuRawFnBase<Args, Return> {
      // Can only set the name once, other calls are ignored.
      label = label ?? newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(label);

      const replacedImpl = Object.entries(externalMap).reduce(
        (acc, [externalName, external]) => {
          if (!isResolvable(external)) {
            return acc;
          }

          const resolvedExternal = ctx.resolve(external);
          return acc.replaceAll(
            new RegExp(`(?<![\\w_])${externalName}(?![\\w_])`, 'g'),
            resolvedExternal,
          );
        },
        implementation.trim(),
      );

      ctx.addDeclaration(wgsl`fn ${ident}${replacedImpl}`);
      return ctx.resolve(ident);
    },
  };

  const call = (...args: UnwrapArgs<Args>): UnwrapReturn<Return> => {
    if (inGPUMode()) {
      // TODO: Filter out only those arguments which are valid to pass around
      return new FnCall(fn, args as Wgsl[]) as UnwrapReturn<Return>;
    }

    throw new Error(
      'Cannot execute on the CPU functions constructed with raw WGSL',
    );
  };

  const fn = Object.assign(call, fnBase);

  // Making the label available as a readonly property.
  Object.defineProperty(fn, 'label', {
    get: () => label,
  });

  return fn;
}

class FnCall<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> implements TgpuResolvable
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
