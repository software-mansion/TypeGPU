import type { TgpuNamable } from '../../namable';
import type { Block } from '../../smol';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { IOLayout, Implementation, UnwrapIO } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a fragment entry function signature (its arguments and return type)
 */
export interface TgpuFragmentFnShell<
  Varying extends IOLayout,
  // TODO: Allow only vec4fs, or arrays/objects of vec4fs
  Output extends IOLayout,
> {
  readonly argTypes: [Varying];
  readonly returnType: Output;

  /**
   * Creates a type-safe implementation of this signature
   */
  implement(
    implementation: (varying: UnwrapIO<Varying>) => UnwrapIO<Output>,
  ): TgpuFragmentFn<Varying, Output>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  implement(implementation: string): TgpuFragmentFn<Varying, Output>;
}

export interface TgpuFragmentFn<
  Varying extends IOLayout,
  // TODO: Allow only vec4fs, or arrays/objects of vec4fs
  Output extends IOLayout,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFragmentFnShell<Varying, Output>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

/**
 * Creates a shell of a typed entry function for the fragment shader stage. Any function
 * that implements this shell can run for each fragment (pixel), allowing the inner code
 * to process information received from the vertex shader stage and builtins to determine
 * the final color of the pixel (many pixels in case of multiple targets).
 *
 * @param varyingTypes
 *   Values computed in the vertex stage to be made available to functions that implement this shell.
 * @param outputType
 *   A `vec4f`, signaling this function outputs a color for one target, or a struct/array containing
 *   colors for multiple targets.
 */
export function fragmentFn<Varying extends IOLayout, Output extends IOLayout>(
  varyingTypes: Varying,
  outputType: Output,
): TgpuFragmentFnShell<Varying, Output> {
  return {
    argTypes: [varyingTypes],
    returnType: outputType,

    implement(implementation): TgpuFragmentFn<Varying, Output> {
      return createFragmentFn(this, implementation as Implementation);
    },
  };
}

// --------------
// Implementation
// --------------

function createFragmentFn(
  shell: TgpuFragmentFnShell<IOLayout, IOLayout>,
  implementation: Implementation,
): TgpuFragmentFn<IOLayout, IOLayout> {
  type This = TgpuFragmentFn<IOLayout, IOLayout>;

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
