import type {
  AnyVertexInputBuiltin,
  AnyVertexOutputBuiltin,
  OmitBuiltins,
} from '../../builtin.ts';
import type { Decorated, Interpolate, Location } from '../../data/wgslTypes.ts';
import {
  getName,
  isNamable,
  setName,
  type TgpuNamable,
} from '../../shared/meta.ts';
import { $getNameForward, $internal } from '../../shared/symbols.ts';
import type { GenerationCtx } from '../../tgsl/generationHelpers.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type {
  BaseIOData,
  Implementation,
  InferIO,
  IORecord,
} from './fnTypes.ts';
import { createIoSchema, type IOLayoutToSchema } from './ioSchema.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

export type VertexInConstrained = IORecord<
  BaseIOData | Decorated<BaseIOData, Location[]> | AnyVertexInputBuiltin
>;

export type VertexOutConstrained = IORecord<
  | BaseIOData
  | Decorated<BaseIOData, (Location | Interpolate)[]>
  | AnyVertexOutputBuiltin
>;

/**
 * Describes a vertex entry function signature (its arguments, return type and attributes)
 */
type TgpuVertexFnShellHeader<
  VertexIn extends VertexInConstrained,
  VertexOut extends VertexOutConstrained,
> = {
  readonly in: VertexIn | undefined;
  readonly out: VertexOut;
  readonly argTypes: [IOLayoutToSchema<VertexIn>] | [];
  readonly isEntry: true;
};

/**
 * Describes a vertex entry function signature (its arguments, return type and attributes).
 * Allows creating tgpu vertex functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuVertexFnShell<
  VertexIn extends VertexInConstrained,
  VertexOut extends VertexOutConstrained,
> =
  & TgpuVertexFnShellHeader<VertexIn, VertexOut>
  & ((
    implementation: (input: InferIO<VertexIn>) => InferIO<VertexOut>,
  ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>)
  & ((
    implementation: string,
  ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>)
  & ((
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>)
  & {
    /**
     * @deprecated Invoke the shell as a function instead.
     */
    does:
      & ((
        implementation: (input: InferIO<VertexIn>) => InferIO<VertexOut>,
      ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>)
      & ((
        implementation: string,
      ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>);
  };

export interface TgpuVertexFn<
  VertexIn extends VertexInConstrained = VertexInConstrained,
  VertexOut extends VertexOutConstrained = VertexOutConstrained,
> extends TgpuNamable {
  readonly [$internal]: true;
  readonly shell: TgpuVertexFnShellHeader<VertexIn, VertexOut>;
  $uses(dependencyMap: Record<string, unknown>): this;
}

export function vertexFn<VertexOut extends VertexOutConstrained>(options: {
  out: VertexOut;
  // biome-ignore lint/complexity/noBannedTypes: it's fine
}): TgpuVertexFnShell<{}, VertexOut>;

export function vertexFn<
  VertexIn extends VertexInConstrained,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends VertexOutConstrained,
>(options: {
  in: VertexIn;
  out: VertexOut;
}): TgpuVertexFnShell<VertexIn, VertexOut>;

/**
 * Creates a shell of a typed entry function for the vertex shader stage. Any function
 * that implements this shell can run for each vertex, allowing the inner code to process
 * attributes and determine the final position of the vertex.
 *
 * @param options.in
 *   Vertex attributes and builtins to be made available to functions that implement this shell.
 * @param options.out
 *   A record containing the final position of the vertex, and any information
 *   passed onto the fragment shader stage.
 */
export function vertexFn<
  VertexIn extends VertexInConstrained,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends VertexOutConstrained,
>(options: {
  in?: VertexIn;
  out: VertexOut;
}): TgpuVertexFnShell<VertexIn, VertexOut> {
  if (Object.keys(options.out).length === 0) {
    throw new Error(
      `A vertexFn output cannot be empty since it must include the 'position' builtin.`,
    );
  }
  const shell: TgpuVertexFnShellHeader<VertexIn, VertexOut> = {
    in: options.in,
    out: options.out,
    argTypes: options.in && Object.keys(options.in).length !== 0
      ? [createIoSchema(options.in)]
      : [],
    isEntry: true,
  };

  const call = (
    arg: Implementation | TemplateStringsArray,
    ...values: unknown[]
  ) => createVertexFn(shell, stripTemplate(arg, ...values));

  return Object.assign(Object.assign(call, shell), {
    does: call,
  }) as TgpuVertexFnShell<VertexIn, VertexOut>;
}

// --------------
// Implementation
// --------------

function createVertexFn(
  shell: TgpuVertexFnShellHeader<VertexInConstrained, VertexOutConstrained>,
  implementation: Implementation,
): TgpuVertexFn<VertexInConstrained, VertexOutConstrained> {
  type This =
    & TgpuVertexFn<VertexInConstrained, VertexOutConstrained>
    & SelfResolvable
    & {
      [$internal]: true;
      [$getNameForward]: FnCore;
    };

  const core = createFnCore(implementation, '@vertex ');
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
      setName(core, newLabel);
      if (isNamable(inputType)) {
        inputType.$name(`${newLabel}_Input`);
      }
      return this;
    },

    '~resolve'(ctx: ResolutionCtx): string {
      const outputWithLocation = createIoSchema(
        shell.out,
        ctx.varyingLocations,
      ).$name(`${getName(this) ?? ''}_Output`);

      if (typeof implementation === 'string') {
        if (inputType) {
          core.applyExternals({ In: inputType });
        }
        core.applyExternals({ Out: outputWithLocation });

        return core.resolve(
          ctx,
          shell.argTypes,
          outputWithLocation,
        );
      }

      const generationCtx = ctx as GenerationCtx;
      if (generationCtx.callStack === undefined) {
        throw new Error(
          'Cannot resolve a TGSL function outside of a generation context',
        );
      }

      try {
        generationCtx.callStack.push(outputWithLocation);
        return core.resolve(
          ctx,
          shell.argTypes,
          outputWithLocation,
        );
      } finally {
        generationCtx.callStack.pop();
      }
    },

    toString() {
      return `vertexFn:${getName(core) ?? '<unnamed>'}`;
    },
  };
  return result;
}
