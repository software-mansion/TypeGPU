import type { AnyBuiltin } from '../../builtin';
import type { TgpuNamable } from '../../namable';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { Implementation } from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a compute entry function signature (its arguments and return type)
 */
export interface TgpuComputeFnShell {
  readonly argTypes: [];
  readonly returnType: undefined;
  readonly workgroupSize: [number, number, number];

  /**
   * Creates a type-safe implementation of this signature
   */
  does(implementation: () => undefined): TgpuComputeFn;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(implementation: string): TgpuComputeFn;
}

export interface TgpuComputeFn extends TgpuResolvable, TgpuNamable {
  readonly shell: TgpuComputeFnShell;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export interface ComputeFnOptions {
  workgroupSize: number[];
}

/**
 * Creates a shell of a typed entry function for the compute shader stage. Any function
 * that implements this shell can perform general-purpose computation.
 *
 * @param workgroupSize
 *   Size of blocks that the thread grid will be divided into (up to 3 dimensions).
 */
export function computeFn(
  argTypes: AnyBuiltin[],
  options: ComputeFnOptions,
): TgpuComputeFnShell {
  const { workgroupSize } = options;

  return {
    argTypes: [],
    returnType: undefined,
    workgroupSize: [
      workgroupSize[0] ?? 1,
      workgroupSize[1] ?? 1,
      workgroupSize[2] ?? 1,
    ],

    does(implementation) {
      return createComputeFn(this, workgroupSize, implementation);
    },
  };
}

// --------------
// Implementation
// --------------

function createComputeFn(
  shell: TgpuComputeFnShell,
  workgroupSize: number[],
  implementation: Implementation<[], void>,
): TgpuComputeFn {
  type This = TgpuComputeFn;

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
      return core.resolve(
        ctx,
        `@compute @workgroup_size(${workgroupSize.join(', ')}) `,
      );
    },
  };
}
