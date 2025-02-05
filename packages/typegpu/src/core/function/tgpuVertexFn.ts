import type { OmitBuiltins } from '../../builtin';
import type { AnyWgslStruct } from '../../data/wgslTypes';
import { type TgpuNamable, isNamable } from '../../namable';
import type { GenerationCtx } from '../../smol/wgslGenerator';
import type { Labelled, ResolutionCtx, SelfResolvable } from '../../types';
import { addReturnTypeToExternals } from '../resolve/externals';
import { createFnCore } from './fnCore';
import type {
  ExoticIO,
  IOLayout,
  IORecord,
  Implementation,
  InferIO,
} from './fnTypes';
import {
  type IOLayoutToOutputSchema,
  createOutputType,
  createStructFromIO,
} from './ioOutputType';

// ----------
// Public API
// ----------

/**
 * Describes a vertex entry function signature (its arguments and return type)
 */
export interface TgpuVertexFnShell<
  VertexIn extends IOLayout,
  VertexOut extends IOLayout,
> {
  readonly argTypes: [AnyWgslStruct];
  readonly returnType: VertexOut;
  readonly attributes: [VertexIn];

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (input: InferIO<VertexIn>) => InferIO<VertexOut>,
  ): TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(
    implementation: string,
  ): TgpuVertexFn<OmitBuiltins<VertexIn>, OmitBuiltins<VertexOut>>;
}

export interface TgpuVertexFn<
  VertexIn extends IOLayout = IOLayout,
  VertexOut extends IOLayout = IOLayout,
> extends TgpuNamable {
  readonly shell: TgpuVertexFnShell<VertexIn, VertexOut>;
  readonly outputType: IOLayoutToOutputSchema<VertexOut>;

  $uses(dependencyMap: Record<string, unknown>): this;
}

/**
 * Creates a shell of a typed entry function for the vertex shader stage. Any function
 * that implements this shell can run for each vertex, allowing the inner code to process
 * attributes and determine the final position of the vertex.
 *
 * @param inputType
 *   Vertex attributes and builtins to be made available to functions that implement this shell.
 * @param outputType
 *   A struct type containing the final position of the vertex, and any information
 *   passed onto the fragment shader stage.
 */
export function vertexFn<
  VertexIn extends IORecord,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends IORecord,
>(
  inputType: VertexIn,
  outputType: VertexOut,
): TgpuVertexFnShell<ExoticIO<VertexIn>, ExoticIO<VertexOut>> {
  return {
    attributes: [inputType as ExoticIO<VertexIn>],
    returnType: createOutputType(outputType) as ExoticIO<VertexOut>,
    argTypes: [createStructFromIO(inputType).$name('VertexInput')],

    does(implementation) {
      // biome-ignore lint/suspicious/noExplicitAny: <no thanks>
      return createVertexFn(this, implementation as Implementation) as any;
    },
  };
}

// --------------
// Implementation
// --------------

function createVertexFn(
  shell: TgpuVertexFnShell<IOLayout, IOLayout>,
  implementation: Implementation,
): TgpuVertexFn<IOLayout, IOLayout> {
  type This = TgpuVertexFn<IOLayout, IOLayout> & Labelled & SelfResolvable;

  const core = createFnCore(shell, implementation);
  const outputType = shell.returnType;
  if (typeof implementation === 'string') {
    addReturnTypeToExternals(implementation, shell.returnType, (externals) =>
      core.applyExternals(externals),
    );
  }

  return {
    shell,
    outputType,

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
