import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transformPrecompile } from '../src/compiler/transform.ts';

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

  it('rejects runtime values passed into the arrow', async () => {
    await expect(
      transform(`
        import { precompile } from '@typegpu/prune';
        export const gpu = precompile((root, rt: { format: GPUTextureFormat }) => ({ count: 1 }));
      `),
    ).rejects.toThrow(/inline\.ts:3:46: a precompile\(\) arrow only receives the root/);
  });

  it('stores the WGSL of variants that differ only in their descriptor once', async () => {
    const result = await transform(`
      import { tgpu, d } from 'typegpu';
      import { precompile } from '@typegpu/prune';
      export const gpu = precompile((root) => {
        const vertex = tgpu.vertexFn({ in: { idx: d.builtin.vertexIndex }, out: { pos: d.builtin.position } })(() => {
          'use gpu';
          return { pos: d.vec4f() };
        });
        const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
          'use gpu';
          return d.vec4f(1);
        });
        const render = (format: GPUTextureFormat) =>
          root.createRenderPipeline({ vertex, fragment, targets: { format } });
        return { bgra: render('bgra8unorm'), rgba: render('rgba8unorm') };
      });
    `);
    const code = result?.code ?? '';
    expect(code.match(/shaders: (\[.*\]),/)?.[1]).toMatch(/^\["[^"]*"\]$/);
    expect(code).toContain('{"format":"bgra8unorm"}');
    expect(code).toContain('{"format":"rgba8unorm"}');
    expect(code).toContain('"bgra": c.render(0), "rgba": c.render(1)');
  });

  it('leaves the preferred canvas format of targets without one to the runtime', async () => {
    const result = await transform(`
      import { tgpu, d } from 'typegpu';
      import { precompile } from '@typegpu/prune';
      export const gpu = precompile((root) => {
        const vertex = tgpu.vertexFn({ in: { idx: d.builtin.vertexIndex }, out: { pos: d.builtin.position } })(() => {
          'use gpu';
          return { pos: d.vec4f() };
        });
        const fragment = tgpu.fragmentFn({ out: { a: d.vec4f, b: d.vec4f } })(() => {
          'use gpu';
          return { a: d.vec4f(1), b: d.vec4f(1) };
        });
        return {
          render: root.createRenderPipeline({ vertex, fragment, targets: { b: { format: 'r8unorm' } } }),
        };
      });
    `);
    const code = result?.code ?? '';
    expect(code).toContain('"targets":[{},{"format":"r8unorm"}]');
    expect(code).toContain('"preferredFormatTargets":[0]');
    expect(code).not.toContain('__typegpu_prune_preferred_canvas_format__');
  });

  it('rejects reading the preferred canvas format in the arrow', async () => {
    await expect(
      transform(`
        import { precompile } from '@typegpu/prune';
        export const gpu = precompile(() => ({ format: navigator.gpu.getPreferredCanvasFormat() }));
      `),
    ).rejects.toThrow(/canvas format is only known at runtime/);
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
