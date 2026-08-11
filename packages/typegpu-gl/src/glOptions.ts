import { GlslGenerator } from './glslGenerator.ts';

export function glOptions() {
  return {
    unstable_shaderGenerator: new GlslGenerator(),
  };
}
