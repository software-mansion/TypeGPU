import type { TgpuNamable } from '../../namable';
import type { Block } from '../../smol';
import type { AnyTgpuData, ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { Implementation, UnwrapArgs, UnwrapReturn } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a vertex entry function signature (its arguments and return type)
 */
export interface TgpuVertexFnShell<
  // TODO: Allow vertex attributes and builtins here
  Args extends AnyTgpuData[],
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

export interface TgpuVertexFn<
  // TODO: Allow vertex attributes here
  VertexAttribs extends [],
  // TODO: Allow IO struct here
  Output extends AnyTgpuData,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuVertexFnShell<AnyTgpuData[], AnyTgpuData>;

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
  Args extends AnyTgpuData[],
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

// --------------
// Implementation
// --------------

function createVertexFn<Args extends AnyTgpuData[], Output extends AnyTgpuData>(
  shell: TgpuVertexFnShell<Args, Output>,
  implementation: Implementation<Args, Output>,
): TgpuVertexFn<[], Output> {
  type This = TgpuVertexFn<[], Output>;

  const core = createFnCore(shell, implementation);

  return {
    shell,

    get label() {
      return core.label;
    },

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
      return core.resolve(ctx, '@vertex ');
    },
  };
}
