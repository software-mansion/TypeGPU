import type { TgpuNamable } from '../../namable';
import type { Block } from '../../smol';
import type { ResolutionCtx, TgpuResolvable } from '../../types';
import { createFnCore } from './fnCore';
import type { IOLayout, Implementation, UnwrapIO } from './fnTypes';

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
    implementation: (
      vertexAttribs: UnwrapIO<VertexAttribs>,
    ) => UnwrapIO<Output>,
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
  VertexAttribs extends IOLayout,
  Output extends IOLayout,
> extends TgpuResolvable,
    TgpuNamable {
  readonly shell: TgpuVertexFnShell<VertexAttribs, Output>;

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
): TgpuVertexFnShell<VertexAttribs, Output> {
  return {
    argTypes: [vertexAttribs],
    returnType: outputType,

    does(implementation): TgpuVertexFn<VertexAttribs, Output> {
      return createVertexFn(this, implementation as Implementation);
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
  type This = TgpuVertexFn<IOLayout, IOLayout>;

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
      return core.resolve(ctx, '@vertex ');
    },
  };
}
