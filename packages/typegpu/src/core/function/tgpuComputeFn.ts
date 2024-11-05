import type { TgpuNamable } from '../../namable';
import type { Block } from '../../smol';
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

  /**
   * Creates a type-safe implementation of this signature
   */
  implement(implementation: () => undefined): TgpuComputeFn;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  implement(implementation: string): TgpuComputeFn;
}

export interface TgpuComputeFn extends TgpuResolvable, TgpuNamable {
  readonly shell: TgpuComputeFnShell;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

/**
 * Creates a shell of a typed entry function for the compute shader stage. Any function
 * that implements this shell can perform general-purpose computation.
 *
 * @param workgroupSize
 *   Size of blocks that the thread grid will be divided into (up to 3 dimensions).
 */
export function computeFn(workgroupSize: number[]): TgpuComputeFnShell {
  return {
    argTypes: [],
    returnType: undefined,

    implement(implementation) {
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
      return core.resolve(
        ctx,
        `@compute @workgroup_size(${workgroupSize.join(', ')}) `,
      );
    },
  };
}
