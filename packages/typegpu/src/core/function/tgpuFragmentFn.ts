import type { TgpuNamable } from '../../namable';
import type { Block } from '../../smol';
import type { AnyTgpuData, ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { UnwrapArgs, UnwrapReturn } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a fragment entry function signature (its arguments and return type)
 */
export interface TgpuFragmentFnShell<
  // TODO: Allow IO struct or builtins here
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
  readonly shell: TgpuFragmentFnShell<AnyTgpuData[], AnyTgpuData>;

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
  Args extends AnyTgpuData[],
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

function createFragmentFn<
  Args extends AnyTgpuData[],
  Output extends AnyTgpuData,
>(
  shell: TgpuFragmentFnShell<Args, Output>,
  implementation:
    | ((...args: UnwrapArgs<Args>) => UnwrapReturn<Output>)
    | string,
): TgpuFragmentFn<[], Output> {
  type This = TgpuFragmentFn<[], Output>;

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
      return core.resolve(ctx, '@fragment ');
    },
  };
}
