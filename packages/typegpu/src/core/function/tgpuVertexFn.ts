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
import { addReturnTypeToExternals } from '../resolve/externals.ts';
import { createFnCore, type FnCore } from './fnCore.ts';
import type {
  BaseIOData,
  Implementation,
  InferIO,
  IORecord,
} from './fnTypes.ts';
import { createIoSchema, type IOLayoutToSchema } from './ioOutputType.ts';
import { stripTemplate } from './templateUtils.ts';

// ----------
// Public API
// ----------

export type VertexInConstrained = IORecord<
  BaseIOData | AnyVertexInputBuiltin
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
  readonly argTypes: [IOLayoutToSchema<VertexIn>] | [];
  readonly returnType: IOLayoutToSchema<VertexOut>;
  readonly attributes: [VertexIn];
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
  // biome-ignore lint/suspicious/noExplicitAny: to allow assigning any vertex fn to TgpuVertexFn (non-generic) type
  VertexIn extends VertexInConstrained = any,
  // biome-ignore lint/suspicious/noExplicitAny: to allow assigning any vertex fn to TgpuVertexFn (non-generic) type
  VertexOut extends VertexOutConstrained = any,
> extends TgpuNamable {
  readonly [$internal]: true;
  readonly shell: TgpuVertexFnShellHeader<VertexIn, VertexOut>;
  readonly outputType: IOLayoutToSchema<VertexOut>;
  readonly inputType: IOLayoutToSchema<VertexIn> | undefined;
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
    attributes: [options.in ?? ({} as VertexIn)],
    returnType: createIoSchema(options.out),
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

  const core = createFnCore(shell, implementation);
  const outputType = shell.returnType;
  const inputType = shell.argTypes[0];
  if (typeof implementation === 'string') {
    addReturnTypeToExternals(
      implementation,
      outputType,
      (externals) => core.applyExternals(externals),
    );
  }

  const result: This = {
    shell,
    outputType,
    inputType,

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    [$internal]: true,
    [$getNameForward]: core,
    $name(newLabel: string): This {
      setName(core, newLabel);
      if (isNamable(outputType)) {
        outputType.$name(`${newLabel}_Output`);
      }
      if (isNamable(inputType)) {
        inputType.$name(`${newLabel}_Input`);
      }
      return this;
    },

    '~resolve'(ctx: ResolutionCtx): string {
      if (typeof implementation === 'string') {
        return core.resolve(ctx, '@vertex ');
      }

      const generationCtx = ctx as GenerationCtx;
      if (generationCtx.callStack === undefined) {
        throw new Error(
          'Cannot resolve a TGSL function outside of a generation context',
        );
      }

      try {
        generationCtx.callStack.push(outputType);
        return core.resolve(ctx, '@vertex ');
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
