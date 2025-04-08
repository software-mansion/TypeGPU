import type { OmitBuiltins } from '../../builtin';
import type { AnyWgslStruct } from '../../data/wgslTypes';
import { type TgpuNamable, isNamable } from '../../namable';
import type { GenerationCtx } from '../../smol/wgslGenerator';
import type { Labelled, ResolutionCtx, SelfResolvable } from '../../types';
import { addReturnTypeToExternals } from '../resolve/externals';
import { createFnCore } from './fnCore';
import type { IOLayout, IORecord, Implementation, InferIO } from './fnTypes';
import {
  type IOLayoutToSchema,
  createOutputType,
  createStructFromIO,
} from './ioOutputType';

// ----------
// Public API
// ----------

/**
 * Describes a vertex entry function signature (its arguments, return type and attributes)
 */
type TgpuVertexFnShellHeader<
  VertexIn extends IOLayout,
  VertexOut extends IOLayout,
> = {
  readonly argTypes: [AnyWgslStruct] | [];
  readonly returnType: VertexOut;
  readonly attributes: [VertexIn];
};

/**
 * Describes a vertex entry function signature (its arguments, return type and attributes).
 * Allows creating tgpu vertex functions by calling this shell
 * and passing the implementation (as WGSL string or JS function) as the argument.
 */
export type TgpuVertexFnShell<
  VertexIn extends IOLayout,
  VertexOut extends IOLayout,
> = TgpuVertexFnShellHeader<VertexIn, VertexOut> &
  ((
    implementation: (input: InferIO<VertexIn>) => InferIO<VertexOut>,
  ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>) &
  ((
    implementation: string,
  ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>) & {
    /**
     * @deprecated Invoke the shell as a function instead.
     */
    does: ((
      implementation: (input: InferIO<VertexIn>) => InferIO<VertexOut>,
    ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>) &
      ((
        implementation: string,
      ) => TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>);
  };

export interface TgpuVertexFn<
  VertexIn extends IOLayout = IOLayout,
  VertexOut extends IOLayout = IOLayout,
> extends TgpuNamable {
  readonly shell: TgpuVertexFnShellHeader<VertexIn, VertexOut>;
  readonly outputType: IOLayoutToSchema<VertexOut>;
  readonly inputType: IOLayoutToSchema<VertexIn>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

export function vertexFn<VertexOut extends IORecord>(options: {
  out: VertexOut;
  // biome-ignore lint/complexity/noBannedTypes: it's fine
}): TgpuVertexFnShell<{}, VertexOut>;

export function vertexFn<
  VertexIn extends IORecord,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends IORecord,
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
  VertexIn extends IORecord,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends IORecord,
>(options: {
  in?: VertexIn;
  out: VertexOut;
}): TgpuVertexFnShell<VertexIn, VertexOut> {
  const shell: TgpuVertexFnShellHeader<VertexIn, VertexOut> = {
    attributes: [options.in ?? ({} as VertexIn)],
    returnType: createOutputType(options.out) as unknown as VertexOut,
    argTypes:
      options.in && Object.keys(options.in).length !== 0
        ? [createStructFromIO(options.in)]
        : [],
  };

  const call = (
    implementation: (input: InferIO<VertexIn>) => InferIO<VertexOut> | string,
  ) => createVertexFn(shell, implementation as Implementation);

  return Object.assign(Object.assign(call, shell), {
    does: call,
  }) as TgpuVertexFnShell<VertexIn, VertexOut>;
}

// --------------
// Implementation
// --------------

function createVertexFn(
  shell: TgpuVertexFnShellHeader<IOLayout, IOLayout>,
  implementation: Implementation,
): TgpuVertexFn<IOLayout, IOLayout> {
  type This = TgpuVertexFn<IOLayout, IOLayout> & Labelled & SelfResolvable;

  const core = createFnCore(shell, implementation);
  const outputType = shell.returnType;
  const inputType = shell.argTypes[0];
  if (typeof implementation === 'string') {
    addReturnTypeToExternals(implementation, outputType, (externals) =>
      core.applyExternals(externals),
    );
  }

  return {
    shell,
    outputType,
    inputType,

    get label() {
      return core.label;
    },

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    $name(newLabel: string): This {
      core.label = newLabel;
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
      return `vertexFn:${this.label ?? '<unnamed>'}`;
    },
  } as This;
}
