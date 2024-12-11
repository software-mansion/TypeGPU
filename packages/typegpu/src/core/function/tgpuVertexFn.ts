import type { OmitBuiltins } from '../../builtin';
import { attribute, isBuiltin, location } from '../../data/attributes';
import { getCustomLocation, isData } from '../../data/dataTypes';
import { struct } from '../../data/struct';
import {
  type BaseWgslData,
  type WgslStruct,
  isWgslStruct,
} from '../../data/wgslTypes';
import { invariant } from '../../errors';
import type { TgpuNamable } from '../../namable';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type {
  ExoticIO,
  IOData,
  IOLayout,
  IORecord,
  Implementation,
  InferIO,
  StrictIOLayout,
} from './fnTypes';

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
  readonly argTypes: [VertexIn];
  readonly returnType: VertexOut;

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
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuVertexFnShell<VertexIn, VertexOut>;
  readonly Output: IOLayoutToOutputSchema<VertexOut>;

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
  VertexIn extends StrictIOLayout,
  // Not allowing single-value output, as it is better practice
  // to properly label what the vertex shader is outputting.
  VertexOut extends IORecord,
>(
  inputType: VertexIn,
  outputType: VertexOut,
): TgpuVertexFnShell<ExoticIO<VertexIn>, ExoticIO<VertexOut>> {
  return {
    argTypes: [inputType as ExoticIO<VertexIn>],
    returnType: outputType as ExoticIO<VertexOut>,

    does(implementation) {
      // biome-ignore lint/suspicious/noExplicitAny: <no thanks>
      return createVertexFn(this, implementation as Implementation) as any;
    },
  };
}

// --------------
// Implementation
// --------------

type IOLayoutToOutputSchema<T extends IOLayout> = T extends BaseWgslData
  ? T
  : T extends Record<string, BaseWgslData | undefined>
    ? WgslStruct<T>
    : never;

function withLocations(
  members: Partial<Record<string, BaseWgslData>>,
): Record<string, BaseWgslData> {
  let nextLocation = 0;

  return Object.fromEntries(
    Object.entries(members).map(([key, member]) => {
      invariant(
        member !== undefined,
        'Only types allow for undefined props, values should not.',
      );

      if (isBuiltin(member)) {
        // Skipping builtins
        return [key, member];
      }

      const customLocation = getCustomLocation(member);
      if (customLocation !== undefined) {
        // This member is already marked, start counting from the next location over.
        nextLocation = customLocation + 1;
        return [key, member];
      }

      return [
        key,
        attribute(member, { type: '@location', value: nextLocation++ }),
      ];
    }),
  );
}

function createVertexFn(
  shell: TgpuVertexFnShell<IOLayout, IOLayout>,
  implementation: Implementation,
): TgpuVertexFn<IOLayout, IOLayout> {
  type This = TgpuVertexFn<IOLayout, IOLayout>;

  const core = createFnCore(shell, implementation);

  const Output = isData(shell.returnType)
    ? (location(0, shell.returnType) as IOData)
    : struct(withLocations(shell.returnType) as Record<string, IOData>);

  return {
    shell,
    Output,

    get label() {
      return core.label;
    },

    $uses(newExternals) {
      core.applyExternals(newExternals);
      return this;
    },

    $name(newLabel: string): This {
      core.label = newLabel;
      if (isWgslStruct(Output)) {
        Output.$name(`${newLabel}_Output`);
      }
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      return core.resolve(ctx, '@vertex ');
    },
  };
}
