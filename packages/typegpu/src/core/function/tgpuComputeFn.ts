import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { AnyWgslStruct } from '../../data/wgslTypes.ts';
import { getName, isNamable, setName, type TgpuNamable } from '../../name.ts';
import { $getNameForward } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type { Implementation, InferIO } from './fnTypes.ts';
import { createStructFromIO } from './ioOutputType.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

/**
 * Describes a compute entry function signature (its arguments, return type and workgroup size)
 */
type TgpuComputeFnShellHeader<
  ComputeIn extends Record<string, AnyComputeBuiltin>,
> = {
  readonly argTypes: [AnyWgslStruct] | [];
  readonly returnType: undefined;
  readonly workgroupSize: [number, number, number];
  readonly isEntry: true;
};

/**
 * Describes a compute entry function signature (its arguments, return type and workgroup size).
 * Allows creating tgpu compute functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuComputeFnShell<
  ComputeIn extends Record<string, AnyComputeBuiltin>,
> =
  & TgpuComputeFnShellHeader<ComputeIn> /**
   * Creates a type-safe implementation of this signature
   */
  & ((
    implementation: (input: InferIO<ComputeIn>) => undefined,
  ) => TgpuComputeFn<ComputeIn>)
  & /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */ ((implementation: string) => TgpuComputeFn<ComputeIn>)
  & ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TgpuComputeFn<ComputeIn>)
  & {
    /**
     * @deprecated Invoke the shell as a function instead.
     */
    does:
      & ((
        implementation: (input: InferIO<ComputeIn>) => undefined,
      ) => TgpuComputeFn<ComputeIn>)
      & /**
       * @param implementation
       *   Raw WGSL function implementation with header and body
       *   without `fn` keyword and function name
       *   e.g. `"(x: f32) -> f32 { return x; }"`;
       */ ((implementation: string) => TgpuComputeFn<ComputeIn>);
  };

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

export function computeFn(options: {
  workgroupSize: number[];
  // biome-ignore lint/complexity/noBannedTypes: it's fine
}): TgpuComputeFnShell<{}>;

export function computeFn<
  ComputeIn extends Record<string, AnyComputeBuiltin>,
>(options: {
  in: ComputeIn;
  workgroupSize: number[];
}): TgpuComputeFnShell<ComputeIn>;

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
  in?: ComputeIn;
  workgroupSize: number[];
}): TgpuComputeFnShell<ComputeIn> {
  const shell: TgpuComputeFnShellHeader<ComputeIn> = {
    argTypes: options.in && Object.keys(options.in).length !== 0
      ? [createStructFromIO(options.in)]
      : [],
    returnType: undefined,
    workgroupSize: [
      options.workgroupSize[0] ?? 1,
      options.workgroupSize[1] ?? 1,
      options.workgroupSize[2] ?? 1,
    ],
    isEntry: true,
  };

  const call = (
    arg: Implementation | TemplateStringsArray,
    ...values: unknown[]
  ) =>
    createComputeFn(
      shell,
      options.workgroupSize,
      stripTemplate(arg, ...values),
    );

  return Object.assign(Object.assign(call, shell), {
    does: call,
  }) as TgpuComputeFnShell<ComputeIn>;
}

// --------------
// Implementation
// --------------

function createComputeFn<ComputeIn extends Record<string, AnyComputeBuiltin>>(
  shell: TgpuComputeFnShellHeader<ComputeIn>,
  workgroupSize: number[],
  implementation: Implementation,
): TgpuComputeFn<ComputeIn> {
  type This = TgpuComputeFn<ComputeIn> & SelfResolvable & {
    [$getNameForward]: FnCore;
  };

  const core = createFnCore(shell, implementation);
  const inputType = shell.argTypes[0];

  return {
    shell,

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    [$getNameForward]: core,
    $name(newLabel: string): This {
      setName(core, newLabel);
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
      return `computeFn:${getName(core) ?? '<unnamed>'}`;
    },
  } as This;
}
