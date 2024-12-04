import type { Block } from 'tinyest';
import { location, struct } from '../../data';
import { attribute, isBuiltin } from '../../data/attributes';
import { getCustomLocation } from '../../data/dataTypes';
import { isData } from '../../data/dataTypes';
import type { BaseWgslData, WgslStruct } from '../../data/wgslTypes';
import type { TgpuNamable } from '../../namable';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type {
  ExoticIO,
  IOData,
  IOLayout,
  Implementation,
  InferIO,
} from './fnTypes';

// ----------
// Public API
// ----------

/**
 * Describes a vertex entry function signature (its arguments and return type)
 */
export interface TgpuVertexFnShell<
  VertexAttribs extends IOLayout,
  Output extends IOLayout,
> {
  readonly argTypes: [VertexAttribs];
  readonly returnType: Output;

  /**
   * Creates a type-safe implementation of this signature
   */
  does(
    implementation: (vertexAttribs: InferIO<VertexAttribs>) => InferIO<Output>,
  ): TgpuVertexFn<VertexAttribs, Output>;

  /**
   * @param implementation
   *   Raw WGSL function implementation with header and body
   *   without `fn` keyword and function name
   *   e.g. `"(x: f32) -> f32 { return x; }"`;
   */
  does(implementation: string): TgpuVertexFn<VertexAttribs, Output>;
}

export interface TgpuVertexFn<
  VertexAttribs extends IOLayout = IOLayout,
  Output extends IOLayout = IOLayout,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuVertexFnShell<VertexAttribs, Output>;
  readonly Output: IOLayoutToOutputStruct<Output>;

  $uses(dependencyMap: Record<string, unknown>): this;
  $__ast(argNames: string[], body: Block): this;
}

/**
 * Creates a shell of a typed entry function for the vertex shader stage. Any function
 * that implements this shell can run for each vertex, allowing the inner code to process
 * attributes and determine the final position of the vertex.
 *
 * @param vertexAttribs
 *   Vertex attributes to be made available to functions that implement this shell.
 * @param outputType
 *   A struct type containing the final position of the vertex, and any information
 *   passed onto the fragment shader stage.
 */
export function vertexFn<
  VertexAttribs extends IOLayout,
  Output extends IOLayout,
>(
  vertexAttribs: VertexAttribs,
  outputType: Output,
): TgpuVertexFnShell<ExoticIO<VertexAttribs>, ExoticIO<Output>> {
  return {
    argTypes: [vertexAttribs as ExoticIO<VertexAttribs>],
    returnType: outputType as ExoticIO<Output>,

    does(
      implementation,
    ): TgpuVertexFn<ExoticIO<VertexAttribs>, ExoticIO<Output>> {
      // biome-ignore lint/suspicious/noExplicitAny: <no need>
      return createVertexFn(this, implementation as Implementation) as any;
    },
  };
}

// --------------
// Implementation
// --------------

type IOLayoutToOutputStruct<T extends IOLayout> = T extends BaseWgslData
  ? WgslStruct<{ out: T }>
  : T extends Record<string, BaseWgslData>
    ? WgslStruct<T>
    : never;

function withLocations(
  members: Record<string, BaseWgslData>,
): Record<string, BaseWgslData> {
  let nextLocation = 0;

  return Object.fromEntries(
    Object.entries(members).map(([key, member]) => {
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

  const Output = struct(
    withLocations(
      isData(shell.returnType)
        ? { out: location(0, shell.returnType) }
        : shell.returnType,
    ) as Record<string, IOData>,
  );

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

    $__ast(argNames: string[], body: Block): This {
      // When receiving a pre-built $__ast, we are receiving $uses alongside it, so
      // we do not need to verify external names.
      core.setAst({ argNames, body, externalNames: [] });
      return this;
    },

    $name(newLabel: string): This {
      core.label = newLabel;
      Output.$name(`${newLabel}_Output`);
      return this;
    },

    resolve(ctx: ResolutionCtx): string {
      return core.resolve(ctx, '@vertex ');
    },
  };
}
