import tgpu from 'typegpu';
import { GLSLShaderGenerator } from '../../src/index.ts';

type ResolvableArray = Parameters<typeof tgpu.resolve>[0];

/**
 * Just a shorthand for tgpu.resolve, with a custom generator
 */
export function asGLSL(...values: ResolvableArray): string {
  const shaderGenerator = new GLSLShaderGenerator();
  return tgpu.resolve(values, { shaderGenerator });
}
