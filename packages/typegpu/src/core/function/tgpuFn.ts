import type { Unwrap } from 'typed-binary';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import { valueList } from '../../resolutionUtils';
import type { Block } from '../../smol';
import { code } from '../../tgpuCode';
import { identifier } from '../../tgpuIdentifier';
import type {
  AnyTgpuData,
  ResolutionCtx,
  TgpuResolvable,
  Wgsl,
} from '../../types';
import wgsl from '../../wgsl';
import {
  applyExternals,
  replaceExternalsInWgsl,
  throwIfMissingExternals,
} from './externals';

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

export interface TgpuFnShellBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
> {
  readonly argTypes: Args;
  readonly returnType: Return | undefined;
}

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

interface TgpuFnBase<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFnShell<Args, Return>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

export type TgpuFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined = undefined,
> = TgpuFnBase<Args, Return> &
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

export function procedure(implementation: () => void) {
  return fn().implement(implementation);
}

/**
 * Describes a vertex entry function signature (its arguments and return type)
 */
export interface TgpuVertexFnShell<
  Args extends AnyTgpuDataTuple,
  // TODO: Allow IO struct here
  Return extends AnyTgpuData,
> {
  readonly argTypes: Args;
  readonly returnType: Return;

  /**
   * Creates a type-safe implementation of this signature
   */
  implement(
    implementation: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ): TgpuVertexFn<[], Return>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  implement(implementation: string): TgpuVertexFn<[], Return>;
}

interface TgpuVertexFn<
  // TODO: Allow vertex attributes here
  VertexAttribs extends [],
  // TODO: Allow IO struct here
  Output extends AnyTgpuData,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuVertexFnShell<AnyTgpuDataTuple, AnyTgpuData>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

/**
 * Creates a shell of a typed entry function for the vertex shader stage. Any function
 * that implements this shell can run for each vertex, allowing the inner code to process
 * attributes and determine the final position of the vertex.
 *
 * @param argTypes
 *   Builtins and vertex attributes to be made available to functions that implement this shell.
 * @param returnType
 *   A struct type containing the final position of the vertex, and any information
 *   passed onto the fragment shader stage.
 */
export function vertexFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData,
>(argTypes: Args, returnType: Return): TgpuVertexFnShell<Args, Return> {
  return {
    argTypes,
    returnType,

    implement(implementation) {
      return createVertexFn(this, implementation);
    },
  };
}

/**
 * Describes a fragment entry function signature (its arguments and return type)
 */
export interface TgpuFragmentFnShell<
  Args extends AnyTgpuDataTuple,
  // TODO: Allow IO struct here
  Return extends AnyTgpuData,
> {
  readonly argTypes: Args;
  readonly returnType: Return;

  /**
   * Creates a type-safe implementation of this signature
   */
  implement(
    implementation: (...args: UnwrapArgs<Args>) => UnwrapReturn<Return>,
  ): TgpuFragmentFn<[], Return>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  implement(implementation: string): TgpuFragmentFn<[], Return>;
}

interface TgpuFragmentFn<
  Args extends [],
  // TODO: Allow IO struct or `vec4f` here
  Output extends AnyTgpuData,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFragmentFnShell<AnyTgpuDataTuple, AnyTgpuData>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

/**
 * Creates a shell of a typed entry function for the fragment shader stage. Any function
 * that implements this shell can run for each fragment (pixel), allowing the inner code
 * to process information received from the vertex shader stage and builtins to determine
 * the final color of the pixel (many pixels in case of multiple targets).
 *
 * @param argTypes
 *   Builtins and vertex attributes to be made available to functions that implement this shell.
 * @param returnType
 *   A `vec4f`, signaling this function outputs a color for one target, or a struct containing
 *   colors for multiple targets.
 */
export function fragmentFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData,
>(argTypes: Args, returnType: Return): TgpuFragmentFnShell<Args, Return> {
  return {
    argTypes,
    returnType,

    implement(implementation) {
      return createFragmentFn(this, implementation);
    },
  };
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
    return createFn(this, implementation);
  }
}

function createFn<
  Args extends AnyTgpuDataTuple,
  Return extends AnyTgpuData | undefined,
>(
  shell: TgpuFnShell<Args, Return>,
  implementation:
    | ((...args: UnwrapArgs<Args>) => UnwrapReturn<Return>)
    | string,
): TgpuFn<Args, Return> {
  type This = TgpuFnBase<Args, Return>;

  const externalMap: Record<string, unknown> = {};
  let prebuiltAst: {
    argNames: string[];
    body: Block;
    externalNames: string[];
  } | null = null;
  let label: string | undefined;

  const fnBase: This = {
    shell,

    $uses(newExternals) {
      applyExternals(externalMap, newExternals);
      return this;
    },

    $__ast(argNames: string[], body: Block): This {
      // When receiving a pre-built $__ast, we are receiving $uses alongside it, so
      // we do not need to verify external names.
      prebuiltAst = { argNames, body, externalNames: [] };
      return this;
    },

    $name(newLabel: string): This {
      label = newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(label);

      if (typeof implementation === 'string') {
        const replacedImpl = replaceExternalsInWgsl(
          ctx,
          externalMap,
          implementation.trim(),
        );

        ctx.addDeclaration(wgsl`fn ${ident}${replacedImpl}`);
      } else {
        const ast = prebuiltAst ?? ctx.transpileFn(String(implementation));
        throwIfMissingExternals(externalMap, ast.externalNames);

        const { head, body } = ctx.fnToWgsl(
          fn.shell,
          ast.argNames,
          ast.body,
          externalMap,
        );
        ctx.addDeclaration(code`fn ${ident}${head}${body}`);
      }

      return ctx.resolve(ident);
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

function createVertexFn<
  Args extends AnyTgpuDataTuple,
  Output extends AnyTgpuData,
>(
  shell: TgpuVertexFnShell<Args, Output>,
  implementation:
    | ((...args: UnwrapArgs<Args>) => UnwrapReturn<Output>)
    | string,
): TgpuVertexFn<[], Output> {
  type This = TgpuVertexFn<[], Output>;

  const externalMap: Record<string, unknown> = {};
  let prebuiltAst: {
    argNames: string[];
    body: Block;
    externalNames: string[];
  } | null = null;
  let label: string | undefined;

  return {
    shell,

    get label() {
      return label;
    },

    $uses(newExternals) {
      applyExternals(externalMap, newExternals);
      return this;
    },

    $__ast(argNames: string[], body: Block): This {
      // When receiving a pre-built $__ast, we are receiving $uses alongside it, so
      // we do not need to verify external names.
      prebuiltAst = { argNames, body, externalNames: [] };
      return this;
    },

    $name(newLabel: string): This {
      label = newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(label);

      if (typeof implementation === 'string') {
        const replacedImpl = replaceExternalsInWgsl(
          ctx,
          externalMap,
          implementation.trim(),
        );

        ctx.addDeclaration(wgsl`@vertex fn ${ident}${replacedImpl}`);
      } else {
        const ast = prebuiltAst ?? ctx.transpileFn(String(implementation));
        throwIfMissingExternals(externalMap, ast.externalNames);

        const { head, body } = ctx.fnToWgsl(
          this.shell,
          ast.argNames,
          ast.body,
          externalMap,
        );
        ctx.addDeclaration(code`@vertex fn ${ident}${head}${body}`);
      }

      return ctx.resolve(ident);
    },
  };
}

function createFragmentFn<
  Args extends AnyTgpuDataTuple,
  Output extends AnyTgpuData,
>(
  shell: TgpuFragmentFnShell<Args, Output>,
  implementation:
    | ((...args: UnwrapArgs<Args>) => UnwrapReturn<Output>)
    | string,
): TgpuFragmentFn<[], Output> {
  type This = TgpuFragmentFn<[], Output>;

  const externalMap: Record<string, unknown> = {};
  let prebuiltAst: {
    argNames: string[];
    body: Block;
    externalNames: string[];
  } | null = null;
  let label: string | undefined;

  return {
    shell,

    get label() {
      return label;
    },

    $uses(newExternals) {
      applyExternals(externalMap, newExternals);
      return this;
    },

    $__ast(argNames: string[], body: Block): This {
      // When receiving a pre-built $__ast, we are receiving $uses alongside it, so
      // we do not need to verify external names.
      prebuiltAst = { argNames, body, externalNames: [] };
      return this;
    },

    $name(newLabel: string): This {
      label = newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      const ident = identifier().$name(label);

      if (typeof implementation === 'string') {
        const replacedImpl = replaceExternalsInWgsl(
          ctx,
          externalMap,
          implementation.trim(),
        );

        ctx.addDeclaration(wgsl`@fragment fn ${ident}${replacedImpl}`);
      } else {
        const ast = prebuiltAst ?? ctx.transpileFn(String(implementation));
        throwIfMissingExternals(externalMap, ast.externalNames);

        const { head, body } = ctx.fnToWgsl(
          this.shell,
          ast.argNames,
          ast.body,
          externalMap,
        );
        ctx.addDeclaration(code`@fragment fn ${ident}${head}${body}`);
      }

      return ctx.resolve(ident);
    },
  };
}
