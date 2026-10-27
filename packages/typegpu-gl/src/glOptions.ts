import { CrossShaderStageState, GlslGenerator } from './glslGenerator.ts';

export function glOptions() {
  return {
    unstable_shaderGenerator: new GlslGenerator('neutral', new CrossShaderStageState()),
  };
}

/**
 * Resolution options for generating a matching pair of GLSL vertex and fragment shaders.
 *
 * The vertex stage has to be resolved before the fragment stage, as the fragment inputs
 * reuse what the vertex stage decided about the varyings between them (e.g. their
 * interpolation qualifiers). A fragment stage resolved on its own derives them from its
 * own input schema instead.
 */
export function dualGlOptions() {
  const sharedState = new CrossShaderStageState();

  return {
    vertex: {
      unstable_shaderGenerator: new GlslGenerator('vertex', sharedState),
    },
    fragment: {
      unstable_shaderGenerator: new GlslGenerator('fragment', sharedState),
    },
  };
}
