import { describe, expect, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import { glOptions, initWithGL } from '@typegpu/gl';
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

  it('quotes texture features in error messages exactly once', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      root.createTexture({ size: [1, 1], format: 'bgra8unorm' }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'texture format bgra8unorm' (supported formats: r8unorm, rg8unorm, rgba8unorm, rgba8unorm-srgb, rgba16float, rgba32float). Use WebGPU for full TypeGPU functionality.]`,
    );
    expect(() =>
      root.createTexture({ size: [1, 1], format: 'rgba8unorm' }).$usage('storage'),
    ).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'storage texture usage'. Use WebGPU for full TypeGPU functionality.]`,
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
  it('returns a WebGLRenderContext with the provided canvas', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });

    const targetCanvas = createHTMLCanvas({ width: 800, height: 600 });

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

  it('works in environments without WebGPU globals', ({ gl }) => {
    vi.stubGlobal('GPUBufferUsage', undefined);
    vi.stubGlobal('GPUTextureUsage', undefined);
    vi.stubGlobal('GPUShaderStage', undefined);
    try {
      const root = initWithGL({ gl });
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
      expect(pipeline).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('console.log in shaders', () => {
    const fragment = () => {
      'use gpu';
      console.log(d.u32(1));
      return d.vec4f();
    };

    it('becomes a no-op', () => {
      const glsl = tgpu.resolve([fragment], glOptions());
      expect(glsl).toContain('/* console.log() */');
      expect(glsl).not.toMatch(/console\.log\(\s*\d/);
    });

    it('is a no-op in render pipelines created by the WebGL root', ({ gl }) => {
      // The WebGL root stands in for a WebGPU root, so a WGSL log generator would try to
      // allocate log buffers through it, and fail in browsers without WebGPU.
      vi.stubGlobal('GPUBufferUsage', undefined);
      vi.stubGlobal('GPUTextureUsage', undefined);
      vi.stubGlobal('GPUShaderStage', undefined);
      try {
        const root = initWithGL({ gl });
        const pipeline = root.createRenderPipeline({
          vertex: () => {
            'use gpu';
            return { $position: d.vec4f(0, 0, 0, 1) };
          },
          fragment,
        });
        pipeline.draw(3);
      } finally {
        vi.unstubAllGlobals();
      }

      const sources = vi.mocked(gl.shaderSource).mock.calls.map((call) => call[1]);
      expect(sources.some((source) => source.includes('/* console.log() */'))).toBe(true);
    });

    it('warns once in development', () => {
      using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubEnv('NODE_ENV', 'development');
      try {
        const twoLogs = () => {
          'use gpu';
          console.log(d.u32(1));
          console.log(d.u32(2));
          return d.vec4f();
        };
        tgpu.resolve([twoLogs], glOptions());
        tgpu.resolve([fragment], glOptions());
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("'console.log' isn't supported"));
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("doesn't warn outside of development", () => {
      using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.stubEnv('NODE_ENV', 'production');
      try {
        tgpu.resolve([fragment], glOptions());
        expect(warn).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });
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

describe('TgpuRootWebGL - presenting to a canvas', () => {
  function createPipeline(root: ReturnType<typeof initWithGL>) {
    return root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(1, 0, 0, 1);
      },
    });
  }

  function bitmapRendererOf(canvas: HTMLCanvasElement) {
    return canvas.getContext('bitmaprenderer') as unknown as {
      transferFromImageBitmap: ReturnType<typeof vi.fn>;
    };
  }

  it('presents every draw of the same task as one image', async ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({});
    const context = root.configureContext({ canvas });
    const pipeline = createPipeline(root);
    const offscreen = gl.canvas as OffscreenCanvas;

    pipeline.withColorAttachment({ view: context }).draw(3);
    pipeline.withColorAttachment({ view: context, loadOp: 'load' }).draw(3);

    // Transferring resets the drawing buffer, so it cannot happen between the draws
    expect(offscreen.transferToImageBitmap).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(offscreen.transferToImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmapRendererOf(canvas).transferFromImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('presents the pending image before drawing into another canvas', ({
    gl,
    createHTMLCanvas,
  }) => {
    const root = initWithGL({ gl });
    const first = createHTMLCanvas({ width: 100, height: 100 });
    const second = createHTMLCanvas({ width: 200, height: 100 });
    const pipeline = createPipeline(root);

    pipeline.withColorAttachment({ view: root.configureContext({ canvas: first }) }).draw(3);
    expect(bitmapRendererOf(first).transferFromImageBitmap).not.toHaveBeenCalled();

    pipeline.withColorAttachment({ view: root.configureContext({ canvas: second }) }).draw(3);
    expect(bitmapRendererOf(first).transferFromImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmapRendererOf(second).transferFromImageBitmap).not.toHaveBeenCalled();
    expect((gl.canvas as OffscreenCanvas).width).toBe(200);
  });

  it('presents the pending image before an attachment-free draw', async ({
    gl,
    createHTMLCanvas,
  }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({});
    const pipeline = createPipeline(root);
    const offscreen = gl.canvas as OffscreenCanvas;

    pipeline.withColorAttachment({ view: root.configureContext({ canvas }) }).draw(3);
    expect(offscreen.transferToImageBitmap).not.toHaveBeenCalled();

    // Draws into the same drawing buffer, so the canvas image has to be presented first
    createPipeline(root).draw(3);
    expect(bitmapRendererOf(canvas).transferFromImageBitmap).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    expect(offscreen.transferToImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('shares the pending image between roots created with the same context', async ({
    gl,
    createHTMLCanvas,
  }) => {
    const firstRoot = initWithGL({ gl });
    const secondRoot = initWithGL({ gl });
    const first = createHTMLCanvas({});
    const second = createHTMLCanvas({});

    createPipeline(firstRoot)
      .withColorAttachment({ view: firstRoot.configureContext({ canvas: first }) })
      .draw(3);
    expect(bitmapRendererOf(first).transferFromImageBitmap).not.toHaveBeenCalled();

    // The roots share a drawing buffer, so the first image is presented before it gets overwritten
    createPipeline(secondRoot)
      .withColorAttachment({ view: secondRoot.configureContext({ canvas: second }) })
      .draw(3);
    expect(bitmapRendererOf(first).transferFromImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmapRendererOf(second).transferFromImageBitmap).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(bitmapRendererOf(first).transferFromImageBitmap).toHaveBeenCalledTimes(1);
    expect(bitmapRendererOf(second).transferFromImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('skips presenting an empty drawing buffer', async ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({ width: 0, height: 100 });
    const pipeline = createPipeline(root);

    pipeline.withColorAttachment({ view: root.configureContext({ canvas }) }).draw(3);
    await Promise.resolve();

    expect((gl.canvas as OffscreenCanvas).transferToImageBitmap).not.toHaveBeenCalled();
    expect(bitmapRendererOf(canvas).transferFromImageBitmap).not.toHaveBeenCalled();
  });

  it('skips presenting when the context is lost', async ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({});
    const pipeline = createPipeline(root);

    pipeline.withColorAttachment({ view: root.configureContext({ canvas }) }).draw(3);
    vi.mocked(gl.isContextLost).mockReturnValue(true);
    await Promise.resolve();

    expect((gl.canvas as OffscreenCanvas).transferToImageBitmap).not.toHaveBeenCalled();
    expect(bitmapRendererOf(canvas).transferFromImageBitmap).not.toHaveBeenCalled();
  });

  it('presents the pending image when the root is destroyed', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({});
    const pipeline = createPipeline(root);

    pipeline.withColorAttachment({ view: root.configureContext({ canvas }) }).draw(3);
    root.destroy();

    expect(bitmapRendererOf(canvas).transferFromImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('presents only once when the root is destroyed before the microtask runs', async ({
    gl,
    createHTMLCanvas,
  }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({});
    const pipeline = createPipeline(root);

    pipeline.withColorAttachment({ view: root.configureContext({ canvas }) }).draw(3);
    root.destroy();
    await Promise.resolve();

    expect(bitmapRendererOf(canvas).transferFromImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('throws when configuring a canvas that cannot be presented onto', ({
    gl,
    createHTMLCanvas,
  }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({});
    vi.mocked(canvas.getContext).mockImplementation(() => null);

    expect(() => root.configureContext({ canvas })).toThrow(/'bitmaprenderer' context/);
  });

  it('resizes the drawing buffer only when the size changes', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const canvas = createHTMLCanvas({ width: 320, height: 240 });
    const context = root.configureContext({ canvas });
    const pipeline = createPipeline(root);

    const offscreen = gl.canvas as OffscreenCanvas;
    let width = offscreen.width;
    const setWidth = vi.fn((value: number) => {
      width = value;
    });
    Object.defineProperty(offscreen, 'width', { get: () => width, set: setWidth });

    pipeline.withColorAttachment({ view: context }).draw(3);
    pipeline.withColorAttachment({ view: context, loadOp: 'load' }).draw(3);

    // Resizing clears the drawing buffer, which would wipe the first draw
    expect(setWidth).toHaveBeenCalledTimes(1);
    expect(offscreen.width).toBe(320);
    expect(offscreen.height).toBe(240);
  });
});

describe('TgpuRootWebGL - textures', () => {
  it('destroys remaining textures and their framebuffers exactly once', ({ gl }) => {
    const root = initWithGL({ gl });
    const textures = Array.from({ length: 3 }, () =>
      root.createTexture({ size: [1, 1], format: 'rgba8unorm' }).$usage('render'),
    );
    for (const texture of textures) {
      texture.createView('render');
    }

    textures[0]?.destroy();
    root.destroy();
    for (const texture of textures) {
      expect(texture.destroyed).toBe(true);
    }

    const nativeTextures = vi.mocked(gl.createTexture).mock.results.map((result) => result.value);
    const framebuffers = vi.mocked(gl.createFramebuffer).mock.results.map((result) => result.value);
    expect(gl.deleteTexture).toHaveBeenCalledTimes(nativeTextures.length);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(framebuffers.length);
    for (const raw of nativeTextures) {
      expect(
        vi.mocked(gl.deleteTexture).mock.calls.filter(([deleted]) => deleted === raw),
      ).toHaveLength(1);
    }
    for (const framebuffer of framebuffers) {
      expect(
        vi.mocked(gl.deleteFramebuffer).mock.calls.filter(([deleted]) => deleted === framebuffer),
      ).toHaveLength(1);
    }

    root.destroy();
    for (const texture of textures) {
      texture.destroy();
    }
    expect(gl.deleteTexture).toHaveBeenCalledTimes(nativeTextures.length);
    expect(gl.deleteFramebuffer).toHaveBeenCalledTimes(framebuffers.length);
  });

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
