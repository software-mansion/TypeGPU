import { describe, expect, it } from 'vitest';
import { packShaders } from '../src/compiler/shaderChunks.ts';
import { shaderCode } from '../src/runtime/attach.ts';
import { buildFixture } from './utils/build.ts';
import { describeGpuWork } from './utils/compare.ts';
import { installMockGpu } from './utils/mockGpu.ts';

const unpack = (shaders: string[]) => {
  const packed = packShaders(shaders);
  return shaders.map((_, id) => shaderCode(packed, id));
};

describe('packShaders', () => {
  const shared = Array.from({ length: 8 }, (_, i) => `fn helper${i}()->f32{return ${i}.0;}`);
  const variants = ['a+b', 'a*b', 'min(a,b)'].map((op) =>
    [...shared, `fn op(a:f32,b:f32)->f32{return ${op};}`].join(''),
  );

  it('emits shared declarations once', () => {
    const packed = packShaders(variants);
    expect(packed).toStrictEqual({
      chunks: expect.any(Array),
      shaders: [
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
        [0, 1, 2, 3, 4, 5, 6, 7, 9],
        [0, 1, 2, 3, 4, 5, 6, 7, 10],
      ],
    });
    expect(unpack(variants)).toStrictEqual(variants);
  });

  it('emits shaders in full when chunks would not be smaller', () => {
    expect(packShaders([variants[0] as string])).toStrictEqual([variants[0]]);
    expect(packShaders(['fn a(){}', 'fn b(){}'])).toStrictEqual(['fn a(){}', 'fn b(){}']);
  });

  it('round-trips any text', () => {
    const odd = [
      '',
      '\n\nfn a() {\n}\n\n',
      '}}};;{',
      'struct S {\n  a: f32,\n};\nvar<private> s: S;',
    ].map((text) => `${shared.join('\n')}${text}`);
    expect(unpack(odd)).toStrictEqual(odd);
  });
});

async function runApp(path: string) {
  const log = installMockGpu();
  await import(path);
  return log;
}

// Pruned builds emit minified WGSL
const shaderCodes = (log: { kind: string; desc: unknown }[]) =>
  log
    .filter((entry) => entry.kind === 'shaderModule')
    .map((entry) => (entry.desc as GPUShaderModuleDescriptor).code.replace(/\s+/g, ''));

describe('shader variants', async () => {
  const dev = await buildFixture('shaderVariants/index.ts', { precompile: false });
  const pruned = await buildFixture('shaderVariants/index.ts', { precompile: true });

  it('emits shared declarations once', () => {
    expect(pruned.code).toMatch(/shaders: \{\s*"chunks":/);
    expect(pruned.code.match(/fn noise\(/g)).toHaveLength(1);
  });

  it('creates the same shaders as TypeGPU', async () => {
    const devLog = await runApp(dev.path);
    const prunedLog = await runApp(pruned.path);

    expect(shaderCodes(devLog)).toHaveLength(4);
    expect(shaderCodes(prunedLog)).toStrictEqual(shaderCodes(devLog));
    expect(describeGpuWork(prunedLog)).toStrictEqual(describeGpuWork(devLog));
  });
});
