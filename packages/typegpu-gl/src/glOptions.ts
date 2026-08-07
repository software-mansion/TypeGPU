import { fragmentGlslGenerator, glslGenerator, vertexGlslGenerator } from './glslGenerator.ts';

export interface GLOptionsParams {
  shaderStage: 'none' | 'vertex' | 'fragment';
}

export function glOptions(params: GLOptionsParams) {
  return {
    unstable_shaderGenerator: {
      none: glslGenerator,
      vertex: vertexGlslGenerator,
      fragment: fragmentGlslGenerator,
    }[params.shaderStage],
  };
}
