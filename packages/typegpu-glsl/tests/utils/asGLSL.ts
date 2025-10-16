import tgpu from 'typegpu';
import { GLSLShaderGenerator } from '../../src/index.ts';

/**
 * Just a shorthand for tgpu.resolve, with a custom generator
 */
export function asGLSL(...values: unknown[]): string {
  const generator = new GLSLShaderGenerator();

  return tgpu.resolve({
    externals: Object.fromEntries(
      // biome-ignore lint/suspicious/noExplicitAny: shhhh
      values.map((v, i) => [`item_${i}`, v as any]),
    ),
    names: 'strict',
    shaderGenerator: generator,
  });
}
