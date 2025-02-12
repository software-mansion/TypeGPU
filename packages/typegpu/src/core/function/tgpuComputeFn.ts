import type { AnyComputeBuiltin } from '../../builtin';
import type { AnyWgslStruct } from '../../data/struct';
import { type TgpuNamable, isNamable } from '../../namable';
import type { Labelled, ResolutionCtx, SelfResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { Implementation, InferIO } from './fnTypes';
import { createStructFromIO } from './ioOutputType';

// ----------
// Public API
// ----------

/**
 * Describes a compute entry function signature (its arguments and return type)
 */
export interface TgpuComputeFnShell<
  ComputeIn extends Record<string, AnyComputeBuiltin>,
> {
  readonly argTypes: [AnyWgslStruct];
  readonly returnType: undefined;
  readonly workgroupSize: [number, number, number];

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (input: InferIO<ComputeIn>) => undefined,
  ): TgpuComputeFn<ComputeIn>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(implementation: string): TgpuComputeFn<ComputeIn>;
}

export interface TgpuComputeFn<
  ComputeIn extends Record<string, AnyComputeBuiltin> = Record<
    string,
    AnyComputeBuiltin
  >,
> extends TgpuNamable {
  readonly shell: TgpuComputeFnShell<ComputeIn>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export interface ComputeFnOptions {
  workgroupSize: number[];
}

/**
 * Creates a shell of a typed entry function for the compute shader stage. Any function
 * that implements this shell can perform general-purpose computation.
 *
 * @param options.in
 *   Record with builtins used by the compute shader.
 * @param options.workgroupSize
 *   Size of blocks that the thread grid will be divided into (up to 3 dimensions).
 */
export function computeFn<
  ComputeIn extends Record<string, AnyComputeBuiltin>,
>(options: {
  in: ComputeIn;
  workgroupSize: number[];
}): TgpuComputeFnShell<ComputeIn> {
  return {
    argTypes: [createStructFromIO(options.in)],
    returnType: undefined,
    workgroupSize: [
      options.workgroupSize[0] ?? 1,
      options.workgroupSize[1] ?? 1,
      options.workgroupSize[2] ?? 1,
    ],

    does(implementation) {
      return createComputeFn(
        this,
        options.workgroupSize,
        implementation as Implementation,
      );
    },
  };
}

// --------------
// Implementation
// --------------

function createComputeFn<ComputeIn extends Record<string, AnyComputeBuiltin>>(
  shell: TgpuComputeFnShell<ComputeIn>,
  workgroupSize: number[],
  implementation: Implementation,
): TgpuComputeFn<ComputeIn> {
  type This = TgpuComputeFn<ComputeIn> & Labelled & SelfResolvable;

  const core = createFnCore(shell, implementation);
  const inputType = shell.argTypes[0];

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
      if (isNamable(inputType)) {
        inputType.$name(`${newLabel}_Input`);
      }
      return this;
    },

    '~resolve'(ctx: ResolutionCtx): string {
      return core.resolve(
        ctx,
        `@compute @workgroup_size(${workgroupSize.join(', ')}) `,
      );
    },

    toString() {
      return `computeFn:${this.label ?? '<unnamed>'}`;
    },
  } as This;
}
