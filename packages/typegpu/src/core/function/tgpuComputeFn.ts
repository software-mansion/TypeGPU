import type { AnyComputeBuiltin } from '../../builtin.ts';
import type { ResolvedSnippet } from '../../data/snippet.ts';
import { Void } from '../../data/wgslTypes.ts';
import {
  getName,
  isNamable,
  setName,
  type TgpuNamable,
} from '../../shared/meta.ts';
import { $getNameForward, $internal, $resolve } from '../../shared/symbols.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { shaderStageSlot } from '../slot/internalSlots.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type { Implementation, InferIO, IORecord } from './fnTypes.ts';
import { createIoSchema, type IOLayoutToSchema } from './ioSchema.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

/**
 * Describes a compute entry function signature (its arguments, return type and workgroup size)
 */
type TgpuComputeFnShellHeader<
  ComputeIn extends IORecord<AnyComputeBuiltin>,
> = {
  readonly argTypes: [IOLayoutToSchema<ComputeIn>] | [];
  readonly returnType: Void;
  readonly workgroupSize: [number, number, number];
  readonly entryPoint: 'compute';
};

/**
 * Describes a compute entry function signature (its arguments, return type and workgroup size).
 * Allows creating tgpu compute functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuComputeFnShell<
  ComputeIn extends IORecord<AnyComputeBuiltin>,
> =
  & TgpuComputeFnShellHeader<ComputeIn>
  /**
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
  ) => TgpuComputeFn<ComputeIn>);

export interface TgpuComputeFn<
  // oxlint-disable-next-line typescript/no-explicit-any -- to allow assigning any compute fn to TgpuComputeFn (non-generic) type
  ComputeIn extends IORecord<AnyComputeBuiltin> = any,
> extends TgpuNamable {
  readonly [$internal]: true;
  readonly shell: TgpuComputeFnShellHeader<ComputeIn>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export interface ComputeFnOptions {
  workgroupSize: number[];
}

export function computeFn(options: {
  workgroupSize: number[];
}): TgpuComputeFnShell<{}>;

export function computeFn<
  ComputeIn extends IORecord<AnyComputeBuiltin>,
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
  ComputeIn extends IORecord<AnyComputeBuiltin>,
>(options: {
  in?: ComputeIn;
  workgroupSize: number[];
}): TgpuComputeFnShell<ComputeIn> {
  const shell: TgpuComputeFnShellHeader<ComputeIn> = {
    argTypes: options.in && Object.keys(options.in).length !== 0
      ? [createIoSchema(options.in)]
      : [],
    returnType: Void,
    workgroupSize: [
      options.workgroupSize[0] ?? 1,
      options.workgroupSize[1] ?? 1,
      options.workgroupSize[2] ?? 1,
    ],
    entryPoint: 'compute',
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

  return Object.assign(call, shell);
}

export function isTgpuComputeFn<ComputeIn extends IORecord<AnyComputeBuiltin>>(
  value: unknown,
): value is TgpuComputeFn<ComputeIn> {
  return (value as TgpuComputeFn<ComputeIn>)?.shell?.entryPoint === 'compute';
}

// --------------
// Implementation
// --------------

function createComputeFn<ComputeIn extends IORecord<AnyComputeBuiltin>>(
  shell: TgpuComputeFnShellHeader<ComputeIn>,
  workgroupSize: number[],
  implementation: Implementation,
): TgpuComputeFn<ComputeIn> {
  type This = TgpuComputeFn<ComputeIn> & SelfResolvable & {
    [$internal]: true;
    [$getNameForward]: FnCore;
  };

  const core = createFnCore(
    implementation,
    `@compute @workgroup_size(${workgroupSize.join(', ')}) `,
  );
  const inputType = shell.argTypes[0];

  const result: This = {
    shell,

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    [$internal]: true,
    [$getNameForward]: core,
    $name(newLabel: string): This {
      setName(this, newLabel);
      if (isNamable(inputType)) {
        inputType.$name(`${newLabel}_Input`);
      }
      return this;
    },

    [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
      return ctx.withSlots([[shaderStageSlot, 'compute']], () =>
        core.resolve(
          ctx,
          shell.argTypes,
          shell.returnType,
        ));
    },

    toString() {
      return `computeFn:${getName(core) ?? '<unnamed>'}`;
    },
  };
  return result;
}
