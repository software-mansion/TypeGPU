import { describe, expect, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import { initWithGL } from '../src/index.ts';
import { it } from './utils/extendedTest.ts';

// ----------
// Tests
// ----------

describe('TgpuRootWebGL - basic construction', () => {
  it('can be constructed with a WebGL2 context and offscreen canvas', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(root).toBeDefined();
  });
});

describe('TgpuRootWebGL - unsupported operations throw', () => {
  it('throws WebGLFallbackUnsupportedError for createMutable', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.createMutable(d.f32)).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'createMutable'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });

  it('throws WebGLFallbackUnsupportedError for createReadonly', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.createReadonly(d.f32)).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'createReadonly'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });

  it('throws WebGLFallbackUnsupportedError for createQuerySet', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.createQuerySet('timestamp', 1)).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'createQuerySet'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });

  it('throws for device access', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => root.device).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'device'. Use WebGPU for full TypeGPU functionality.]`,
    );
  });
});

describe('TgpuRootWebGL - configureContext', () => {
  it('returns a WebGLRenderContext with the provided canvas', ({ gl }) => {
    const root = initWithGL({ gl });

    const targetCanvas = {
      width: 800,
      height: 600,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;

    const ctx = root.configureContext({
      canvas: targetCanvas,
      alphaMode: 'premultiplied',
    });
    expect(ctx).toBeDefined();
    expect(ctx.canvas).toBe(targetCanvas);
    // oxlint-disable-next-line typescript-eslint(no-explicit-any)
    expect((ctx as any).alphaMode).toBe('premultiplied');
  });
});

describe('TgpuRootWebGL - createRenderPipeline', () => {
  it('compiles GLSL shaders from TypeGPU vertex/fragment functions', ({ gl }) => {
    const root = initWithGL({ gl });

    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    }) /* wgsl */ `{ return Out(vec4f(0.0, 0.0, 0.0, 1.0)); }`;

    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(1.0, 0.0, 0.0, 1.0); }`;

    const pipeline = root.createRenderPipeline({
      vertex: vertFn,
      fragment: fragFn,
    });
    expect(pipeline).toBeDefined();

    // Should have created and compiled shaders
    expect(gl.createShader).toHaveBeenCalledTimes(2);
    expect(gl.compileShader).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);
  });

  it('supports withColorAttachment and draw', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });

    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    }) /* wgsl */ `{ return Out(vec4f(0.0, 0.0, 0.0, 1.0)); }`;

    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(1.0, 0.0, 0.0, 1.0); }`;

    const canvas = createHTMLCanvas({});
    const ctx = root.configureContext({ canvas });
    const pipeline = root.createRenderPipeline({
      vertex: vertFn,
      fragment: fragFn,
    });

    pipeline.withColorAttachment({ view: ctx }).draw(3);

    expect(gl.useProgram).toHaveBeenCalled();
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 3);
  });

  it('draw uses firstVertex parameter', ({ gl }) => {
    const root = initWithGL({ gl });

    const vertFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    }) /* wgsl */ `{ return Out(vec4f(0.0, 0.0, 0.0, 1.0)); }`;

    const fragFn = tgpu.fragmentFn({
      out: d.vec4f,
    }) /* wgsl */ `{ return vec4f(1.0, 0.0, 0.0, 1.0); }`;

    const pipeline = root.createRenderPipeline({
      vertex: vertFn,
      fragment: fragFn,
    });
    pipeline.draw(6, 1, 3);

    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 3, 6);
  });
});

describe('TgpuRootWebGL - textures', () => {
  it('uploads CPU data to a 2D texture', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root.createTexture({ size: [2, 2], format: 'rgba8unorm' });
    const pixels = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);

    texture.write(pixels);

    expect(gl.texStorage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 1, gl.RGBA8, 2, 2);
    expect(gl.texSubImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      2,
      2,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
  });

  it('renders to a texture attachment', ({ gl }) => {
    const root = initWithGL({ gl });
    const target = root.createTexture({ size: [32, 16], format: 'rgba8unorm' }).$usage('render');
    const renderView = target.createView('render');
    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(1, 0, 0, 1);
      },
    });

    pipeline.withColorAttachment({ view: renderView }).draw(3);

    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      expect.anything(),
      0,
    );
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 32, 16);
  });

  it('samples a texture in another render pipeline', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root.createTexture({ size: [2, 2], format: 'rgba8unorm' }).$usage('sampled');
    const view = texture.createView();
    const sampler = root.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });
    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return std.textureSample(view.$, sampler.$, uv);
      },
    });

    pipeline.draw(3);

    expect(gl.bindSampler).toHaveBeenCalledWith(0, expect.anything());
    expect(gl.uniform1i).toHaveBeenCalledWith(expect.anything(), 0);
    const sources = vi.mocked(gl.shaderSource).mock.calls.map((call) => call[1]);
    expect(sources.some((source) => source.includes('uniform sampler2D'))).toBe(true);
    expect(sources.some((source) => source.includes('texture('))).toBe(true);
  });

  it('flips render-to-texture samples and preserves CPU upload orientation', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [2, 2], format: 'rgba8unorm' })
      .$usage('render', 'sampled');
    const renderPipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(1, 0, 0, 1);
      },
    });
    renderPipeline.withColorAttachment({ view: texture.createView('render') }).draw(3);

    const view = texture.createView();
    const sampler = root.createSampler({});
    const samplePipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.25, 0.75) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return std.textureSample(view.$, sampler.$, uv);
      },
    });

    vi.mocked(gl.uniform1i).mockClear();
    samplePipeline.draw(3);
    const renderTargetFlipCalls = vi
      .mocked(gl.uniform1i)
      .mock.calls.filter(
        ([location]) => (location as unknown as { name?: string }).name?.includes('flipY') === true,
      );
    expect(renderTargetFlipCalls).toEqual([[expect.anything(), 1]]);

    texture.write(new Uint8Array(2 * 2 * 4));
    vi.mocked(gl.uniform1i).mockClear();
    samplePipeline.draw(3);
    const cpuUploadFlipCalls = vi
      .mocked(gl.uniform1i)
      .mock.calls.filter(
        ([location]) => (location as unknown as { name?: string }).name?.includes('flipY') === true,
      );
    expect(cpuUploadFlipCalls).toEqual([[expect.anything(), 0]]);

    const sources = vi.mocked(gl.shaderSource).mock.calls.map((call) => call[1]);
    expect(sources.some((source) => source.includes('1.0 -'))).toBe(true);
  });
});

// TODO: Track destroying buffers once buffers can be created
// describe('TgpuRootWebGL - destroy', () => {
//   it('destroys buffers on destroy()', ({ gl }) => {
//     const root = initWithGL({ gl });

//     root.destroy();

//     expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
//   });
// });
