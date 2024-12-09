import type { Vec4f } from '../../data/wgslTypes';
import type { TgpuNamable } from '../../namable';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { ExoticIO, IOLayout, Implementation, InferIO } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a fragment entry function signature (its arguments and return type)
 */
export interface TgpuFragmentFnShell<
  Varying extends IOLayout,
  Output extends IOLayout<Vec4f>,
> {
  readonly argTypes: [Varying];
  readonly returnType: Output;

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (varying: InferIO<Varying>) => InferIO<Output>,
  ): TgpuFragmentFn<Varying, Output>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(implementation: string): TgpuFragmentFn<Varying, Output>;
}

export interface TgpuFragmentFn<
  Varying extends IOLayout = IOLayout,
  Output extends IOLayout<Vec4f> = IOLayout<Vec4f>,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuFragmentFnShell<Varying, Output>;

  $uses(dependencyMap: Record<string, unknown>): this;
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
export function fragmentFn<
  Varying extends IOLayout,
  Output extends IOLayout<Vec4f>,
>(
  varyingTypes: Varying,
  outputType: Output,
): TgpuFragmentFnShell<ExoticIO<Varying>, ExoticIO<Output>> {
  return {
    argTypes: [varyingTypes as ExoticIO<Varying>],
    returnType: outputType as ExoticIO<Output>,

    does(implementation): TgpuFragmentFn<ExoticIO<Varying>, ExoticIO<Output>> {
      return createFragmentFn(this, implementation as Implementation);
    },
  };
}

// --------------
// Implementation
// --------------

function createFragmentFn(
  shell: TgpuFragmentFnShell<IOLayout, IOLayout<Vec4f>>,
  implementation: Implementation,
): TgpuFragmentFn {
  type This = TgpuFragmentFn;

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

    $name(newLabel: string): This {
      core.label = newLabel;
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      return core.resolve(ctx, '@fragment ');
    },
  };
}
