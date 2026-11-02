import { CrossShaderStageState, GlslGenerator } from './glslGenerator.ts';

export function glOptions() {
  return {
    unstable_shaderGenerator: new GlslGenerator('neutral', new CrossShaderStageState()),
  };
}

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
