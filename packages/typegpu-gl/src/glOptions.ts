import glslGenerator from './glslGenerator.ts';

export function glOptions() {
  return {
    unstable_shaderGenerator: glslGenerator,
  };
}
