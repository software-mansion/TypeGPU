import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transformPrecompile } from '../src/build/transform.ts';

// Doesn't need to exist, only its directory is used to resolve imports
const filename = fileURLToPath(new URL('./fixtures/inline.ts', import.meta.url));

const transform = (code: string) => transformPrecompile(code, filename);

describe('precompile() diagnostics', () => {
  it('rejects module-level values that are not constant literals', async () => {
    await expect(
      transform(`
        import { d } from 'typegpu';
        import { precompile } from '@typegpu/prune';
        const Params = d.struct({ a: d.f32 });
        export const gpu = precompile(() => ({ Params }));
      `),
    ).rejects.toThrow(
      /inline\.ts:5:48: .*'Params', a module-level value that isn't a constant literal/,
    );
  });

  it('copies module-level constant literals', async () => {
    const result = await transform(`
      import { d } from 'typegpu';
      import { precompile } from '@typegpu/prune';
      const COUNT = 16;
      export const gpu = precompile(() => ({ Data: d.arrayOf(d.f32, COUNT) }));
    `);
    expect(result?.code).toContain('size: 64');
  });

  it('rejects functions that are not inline', async () => {
    await expect(
      transform(`
        import { precompile } from '@typegpu/prune';
        const fn = () => ({});
        export const gpu = precompile(fn);
      `),
    ).rejects.toThrow(/takes an inline arrow function/);
  });

  it('rejects returning functions', async () => {
    await expect(
      transform(`
        import { precompile } from '@typegpu/prune';
        export const gpu = precompile(() => ({ fn: () => 1 }));
      `),
    ).rejects.toThrow(/result\.fn: functions can't be returned/);
  });

  it('rejects runtime values that reach the shader code', async () => {
    await expect(
      transform(`
        import { tgpu, d } from 'typegpu';
        import { precompile } from '@typegpu/prune';
        export const gpu = precompile((root, rt: { scale: number }) => {
          const scale = tgpu.slot<number>();
          const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
            'use gpu';
            const x = d.f32(scale.$);
          });
          return { pipeline: root.createComputePipeline({ compute: main }).with(scale, rt.scale) };
        });
      `),
    ).rejects.toThrow(/runtime value \('scale'\)/);
  });

  it('allows runtime values in settings that do not change the WGSL', async () => {
    const result = await transform(`
      import { tgpu, d } from 'typegpu';
      import { precompile } from '@typegpu/prune';
      export const gpu = precompile((root, rt: { format: GPUTextureFormat }) => {
        const vertex = tgpu.vertexFn({ in: { idx: d.builtin.vertexIndex }, out: { pos: d.builtin.position } })(() => {
          'use gpu';
          return { pos: d.vec4f() };
        });
        const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
          'use gpu';
          return d.vec4f(1);
        });
        return { pipeline: root.createRenderPipeline({ vertex, fragment, targets: { format: rt.format } }) };
      });
    `);
    expect(result?.code).toContain('{"format":{"$hole":"format"}}');
  });

  it('compiles console.log out of precompiled shaders', async () => {
    const result = await transform(`
      import { tgpu, d } from 'typegpu';
      import { precompile } from '@typegpu/prune';
      export const gpu = precompile((root) => {
        const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
          'use gpu';
          console.log('hello', d.u32(1));
        });
        return { pipeline: root.createComputePipeline({ compute: main }) };
      });
    `);
    expect(result?.code).toContain('shaders: ["@compute@workgroup_size(1)fn main(){;}"]');
  });

  it('points imports of @typegpu/prune at the pruned runtime', async () => {
    const result = await transform(`
      import { init, precompile } from '@typegpu/prune';
      export const gpu = precompile(() => ({ count: 1 }));
      export const root = await init();
    `);
    expect(result?.code).toContain(`import { init } from "@typegpu/prune/runtime";`);
    expect(result?.code).not.toContain(`from '@typegpu/prune'`);
  });
});
