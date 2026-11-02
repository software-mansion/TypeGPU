import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import { describe, expect, vi } from 'vitest';
import { d } from 'typegpu';
import { initWithGL } from '../src/index.ts';
import { TgpuRootWebGL, type TgpuWebGLRenderPipeline } from '../src/tgpuRootWebGL.ts';
import { it } from './utils/extendedTest.ts';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

async function collect(refs: WeakRef<object>[]): Promise<number> {
  let alive = refs;
  for (let i = 0; i < 20 && alive.length > 0; i++) {
    // WeakRef targets stay alive until the end of the current job.
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    alive = alive.filter((ref) => ref.deref() !== undefined);
  }
  return alive.length;
}

describe('TgpuRootWebGL - garbage collection', () => {
  it('collects unused uniforms and their buffers while their root stays alive', async ({ gl }) => {
    const root = new TgpuRootWebGL(gl);
    const refs = Array.from({ length: 100 }, () => {
      const uniform = root.createUniform(d.vec4f);
      return [new WeakRef(uniform), new WeakRef(uniform.buffer)];
    }).flat();

    expect(await collect(refs)).toBe(0);
    root.destroy();
  });

  it('keeps uniforms alive only while a pipeline uses them', async ({ gl }) => {
    const root = new TgpuRootWebGL(gl);
    function createPipeline(): {
      refs: WeakRef<object>[];
      pipeline: TgpuWebGLRenderPipeline | undefined;
    } {
      const uniform = root.createUniform(d.f32, 2);
      return {
        refs: [new WeakRef(uniform), new WeakRef(uniform.buffer)],
        pipeline: root.createRenderPipeline({
          vertex: () => {
            'use gpu';
            return { $position: d.vec4f(0, 0, 0, 1) };
          },
          fragment: () => {
            'use gpu';
            return d.vec4f(uniform.$);
          },
        }),
      };
    }
    const resources = createPipeline();

    expect(await collect(resources.refs)).toBe(2);
    resources.pipeline?.draw(3);
    expect(gl.uniform1f).toHaveBeenCalledExactlyOnceWith(expect.anything(), 2);

    resources.pipeline = undefined;
    expect(await collect(resources.refs)).toBe(0);
    root.destroy();
  });

  it('collects destroyed textures while their root stays alive', async ({ gl }) => {
    const root = initWithGL({ gl });
    const refs = Array.from({ length: 100 }, () => {
      const texture = root.createTexture({ size: [1, 1], format: 'rgba8unorm' });
      texture.destroy();
      return new WeakRef(texture);
    });

    expect(await collect(refs)).toBe(0);
    root.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(100);
  });

  it('collects optimized-out uniforms while their pipeline stays alive', async ({ gl }) => {
    const root = new TgpuRootWebGL(gl);
    vi.mocked(gl.getUniformLocation).mockReturnValue(null);
    function createPipeline() {
      const uniform = root.createUniform(d.f32, 2);
      return {
        refs: [new WeakRef(uniform), new WeakRef(uniform.buffer)],
        pipeline: root.createRenderPipeline({
          vertex: () => {
            'use gpu';
            return { $position: d.vec4f(0, 0, 0, 1) };
          },
          fragment: () => {
            'use gpu';
            // oxlint-disable-next-line oxc/erasing-op -- Exercise native optimization of a referenced uniform.
            return d.vec4f(uniform.$ * 0);
          },
        }),
      };
    }
    const { refs, pipeline } = createPipeline();

    expect(gl.getUniformLocation).toHaveBeenCalledTimes(1);
    expect(await collect(refs)).toBe(0);
    pipeline.draw(3);
    expect(gl.uniform1f).not.toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledTimes(1);
    root.destroy();
  });

  it('does not let a retained texture keep its root or sibling textures alive', async ({ gl }) => {
    function createTextures() {
      const root = initWithGL({ gl });
      const kept = root.createTexture({ size: [1, 1], format: 'rgba8unorm' });
      const sibling = root.createTexture({ size: [1, 1], format: 'rgba8unorm' });
      return { kept, refs: [new WeakRef(root), new WeakRef(sibling)] };
    }
    const { kept, refs } = createTextures();

    expect(await collect(refs)).toBe(0);
    kept.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  });

  it('releases cleanup references even when a destroyed texture is retained', async ({ gl }) => {
    function createTextures() {
      const root = initWithGL({ gl });
      const kept = root.createTexture({ size: [1, 1], format: 'rgba8unorm' });
      const sibling = root.createTexture({ size: [1, 1], format: 'rgba8unorm' });
      const refs = [new WeakRef(root), new WeakRef(sibling)];
      kept.destroy();
      return { kept, refs };
    }
    const { kept, refs } = createTextures();

    expect(await collect(refs)).toBe(0);
    kept.destroy();
    expect(gl.deleteTexture).toHaveBeenCalledTimes(1);
  });
});
