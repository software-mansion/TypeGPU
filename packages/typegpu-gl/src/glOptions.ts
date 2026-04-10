import glslGenerator from './glslGenerator.ts';

export function GLOptions() {
  return {
    unstable_shaderGenerator: glslGenerator,
  };
}
