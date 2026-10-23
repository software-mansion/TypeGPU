import { describe, expect, vi } from 'vitest';
import { d, type DepthStencilAttachment, type TgpuRoot } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

const depthStencil = {
  format: 'depth24plus',
  depthWriteEnabled: true,
  depthCompare: 'less',
} as const;

function createPipeline(root: TgpuRoot, state: GPUDepthStencilState | null = depthStencil) {
  return root.createRenderPipeline({
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(0, 0, 0, 1) };
    },
    fragment: () => {
      'use gpu';
      return d.vec4f(1, 0, 0, 1);
    },
    targets: { format: 'rgba8unorm' },
    depthStencil: state ?? undefined,
  });
}

function createColorTarget(root: TgpuRoot) {
  return root.createTexture({ size: [64, 32], format: 'rgba8unorm' }).$usage('render');
}

/** What an app can pass when it has no depth texture on the WebGL root */
const placeholderView = {} as DepthStencilAttachment['view'];

describe('TgpuRootWebGL - depth testing', () => {
  it('clears and tests against the depth buffer of the canvas', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    createPipeline(root)
      .withColorAttachment({ view: context })
      .withDepthStencilAttachment({
        view: placeholderView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 0.5,
      })
      .draw(3);

    expect(gl.bindFramebuffer).toHaveBeenCalledWith(gl.FRAMEBUFFER, null);
    expect(gl.clearDepth).toHaveBeenCalledWith(0.5);
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Depth writes are enabled for the clear, which is affected by the depth mask in GL
    expect(vi.mocked(gl.depthMask).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(gl.clear).mock.invocationCallOrder[0] ?? Number.NaN,
    );
    expect(gl.enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(gl.depthFunc).toHaveBeenCalledWith(gl.LESS);
    expect(gl.depthMask).toHaveBeenLastCalledWith(true);
  });

  it('keeps the depth buffer and respects depthReadOnly', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    createPipeline(root)
      .withColorAttachment({ view: context, loadOp: 'load' })
      .withDepthStencilAttachment({
        view: placeholderView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
        depthReadOnly: true,
      })
      .draw(3);

    expect(gl.clear).not.toHaveBeenCalled();
    expect(gl.enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(gl.depthMask).toHaveBeenLastCalledWith(false);
  });

  it('attaches depth textures created by the root', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);
    const depth = root.createTexture({ size: [64, 32], format: 'depth24plus' }).$usage('render');
    const depthRaw = vi.mocked(gl.createTexture).mock.results[1]?.value;
    const pipeline = createPipeline(root).withColorAttachment({
      view: color.createView('render'),
    });

    expect(gl.texStorage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, 64, 32);

    const createdFramebuffers = vi.mocked(gl.createFramebuffer).mock.calls.length;
    for (const depthLoadOp of ['clear', 'load'] as const) {
      pipeline
        .withDepthStencilAttachment({ view: depth, depthLoadOp, depthStoreOp: 'store' })
        .draw(3);
    }

    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      depthRaw,
      0,
    );
    // One framebuffer for both draws
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(createdFramebuffers + 1);
    expect(gl.renderbufferStorage).not.toHaveBeenCalled();
  });

  it('attaches depth-stencil textures to the depth-stencil attachment point', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);
    const depth = root
      .createTexture({ size: [64, 32], format: 'depth24plus-stencil8' })
      .$usage('render');

    createPipeline(root, { ...depthStencil, format: 'depth24plus-stencil8' })
      .withColorAttachment({ view: color.createView('render') })
      .withDepthStencilAttachment({
        view: depth.createView('render'),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .draw(3);

    expect(gl.framebufferTexture2D).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.TEXTURE_2D,
      expect.anything(),
      0,
    );
  });

  it('gives texture targets an implicit depth buffer when no depth texture is passed', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);
    const pipeline = createPipeline(root).withColorAttachment({ view: color });

    pipeline
      .withDepthStencilAttachment({
        view: placeholderView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .draw(3);
    pipeline
      .withDepthStencilAttachment({
        view: placeholderView,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .draw(3);

    // Created once, and shared by both passes
    expect(gl.renderbufferStorage).toHaveBeenCalledOnce();
    expect(gl.renderbufferStorage).toHaveBeenCalledWith(
      gl.RENDERBUFFER,
      gl.DEPTH24_STENCIL8,
      64,
      32,
    );
    expect(gl.framebufferRenderbuffer).toHaveBeenCalledOnce();
    expect(gl.framebufferRenderbuffer).toHaveBeenCalledWith(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      vi.mocked(gl.createRenderbuffer).mock.results[0]?.value,
    );
  });

  it('does not attach a depth buffer to passes that have none', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root).createView('render');
    const colorOnlyFramebuffer = vi.mocked(gl.createFramebuffer).mock.results[0]?.value;

    createPipeline(root)
      .withColorAttachment({ view: color })
      .withDepthStencilAttachment({
        view: placeholderView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .draw(3);
    vi.mocked(gl.bindFramebuffer).mockClear();
    createPipeline(root, null).withColorAttachment({ view: color, loadOp: 'load' }).draw(3);

    expect(gl.bindFramebuffer).toHaveBeenNthCalledWith(1, gl.FRAMEBUFFER, colorOnlyFramebuffer);
    expect(gl.disable).toHaveBeenCalledWith(gl.DEPTH_TEST);
  });

  it('releases cached framebuffers and depth buffers with the target texture', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);

    createPipeline(root)
      .withColorAttachment({ view: color })
      .withDepthStencilAttachment({
        view: placeholderView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .draw(3);
    color.destroy();

    const framebuffers = vi.mocked(gl.createFramebuffer).mock.results.map((r) => r.value);
    for (const framebuffer of framebuffers) {
      expect(gl.deleteFramebuffer).toHaveBeenCalledWith(framebuffer);
    }
    expect(gl.deleteRenderbuffer).toHaveBeenCalledWith(
      vi.mocked(gl.createRenderbuffer).mock.results[0]?.value,
    );
  });

  it('applies depth bias', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    createPipeline(root, { ...depthStencil, depthBias: 2, depthBiasSlopeScale: 1.5 })
      .withColorAttachment({ view: context })
      .withDepthStencilAttachment({ view: placeholderView, depthLoadOp: 'load' })
      .draw(3);

    expect(gl.enable).toHaveBeenCalledWith(gl.POLYGON_OFFSET_FILL);
    expect(gl.polygonOffset).toHaveBeenCalledWith(1.5, 2);
  });

  it('throws when a pipeline with depth state has no depth attachment', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() => createPipeline(root).draw(3)).toThrow(/requires a depth-stencil attachment/);
  });

  it('throws when the canvas context has no depth buffer', ({ gl, createHTMLCanvas }) => {
    vi.mocked(gl.getContextAttributes).mockReturnValue({ depth: false });
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    expect(() =>
      createPipeline(root)
        .withColorAttachment({ view: context })
        .withDepthStencilAttachment({ view: placeholderView, depthLoadOp: 'clear' })
        .draw(3),
    ).toThrow(/created with { depth: false }/);
  });

  it('cannot write to depth textures from the CPU', ({ gl }) => {
    const root = initWithGL({ gl });
    const depth = root.createTexture({ size: [2, 2], format: 'depth32float' }).$usage('render');

    expect(() => depth.write(new Float32Array(4))).toThrow(
      "WebGL fallback does not support 'writing to depth textures'",
    );
  });
});

describe('TgpuRootWebGL - stencil', () => {
  it('applies the stencil state and reference', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);

    createPipeline(root, {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: { compare: 'equal', passOp: 'replace' },
      stencilReadMask: 0x0f,
    })
      .withColorAttachment({ view: color })
      .withDepthStencilAttachment({
        view: placeholderView,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store',
        stencilClearValue: 1,
      })
      .withStencilReference(3)
      .draw(3);

    expect(gl.clearStencil).toHaveBeenCalledWith(1);
    // Depth isn't read-only, so it gets cleared too, like in WebGPU
    expect(gl.clear).toHaveBeenCalledWith(
      gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT,
    );
    expect(gl.enable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.stencilFuncSeparate).toHaveBeenCalledWith(gl.FRONT, gl.EQUAL, 3, 0x0f);
    expect(gl.stencilOpSeparate).toHaveBeenCalledWith(gl.FRONT, gl.KEEP, gl.KEEP, gl.REPLACE);
    expect(gl.stencilFuncSeparate).toHaveBeenCalledWith(gl.BACK, gl.ALWAYS, 3, 0x0f);
    expect(gl.stencilMaskSeparate).toHaveBeenLastCalledWith(gl.BACK, 0xffffffff);
  });

  it('leaves the stencil test off for the default stencil state', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });

    createPipeline(root)
      .withColorAttachment({ view: context })
      .withDepthStencilAttachment({ view: placeholderView, depthLoadOp: 'clear' })
      .draw(3);

    expect(gl.disable).toHaveBeenCalledWith(gl.STENCIL_TEST);
    expect(gl.enable).not.toHaveBeenCalledWith(gl.STENCIL_TEST);
  });
});

describe('TgpuRootWebGL - depth-stencil validation', () => {
  it('clears aspects that are not read-only by default, like WebGPU', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);
    const stencilPipeline = createPipeline(root, {
      ...depthStencil,
      format: 'depth24plus-stencil8',
    }).withColorAttachment({ view: color });

    stencilPipeline.withDepthStencilAttachment({ view: placeholderView }).draw(3);
    expect(gl.clear).toHaveBeenLastCalledWith(
      gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT,
    );

    stencilPipeline
      .withDepthStencilAttachment({
        view: placeholderView,
        depthReadOnly: true,
        stencilReadOnly: true,
      })
      .draw(3);
    expect(gl.clear).toHaveBeenLastCalledWith(gl.COLOR_BUFFER_BIT);
  });

  it('throws when the attachment format differs from the pipeline', ({ gl }) => {
    const root = initWithGL({ gl });
    const depth = root.createTexture({ size: [64, 32], format: 'depth32float' }).$usage('render');

    expect(() =>
      createPipeline(root)
        .withColorAttachment({ view: createColorTarget(root) })
        .withDepthStencilAttachment({ view: depth })
        .draw(3),
    ).toThrow("has format 'depth32float', but the pipeline was created for 'depth24plus'");
  });

  it('throws for a depth-stencil attachment on a pipeline without depthStencil', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      createPipeline(root, null)
        .withColorAttachment({ view: createColorTarget(root) })
        .withDepthStencilAttachment({ view: placeholderView })
        .draw(3),
    ).toThrow('created without depthStencil state');
  });

  it('throws for stencil state with a depth-only format', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      createPipeline(root, { ...depthStencil, stencilFront: { compare: 'equal' } }),
    ).toThrow("format 'depth24plus' has no stencil aspect");
  });

  it('throws for a depth texture when rendering into a canvas', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const context = root.configureContext({ canvas: createHTMLCanvas({}) });
    const depth = root.createTexture({ size: [64, 32], format: 'depth24plus' }).$usage('render');

    expect(() =>
      createPipeline(root)
        .withColorAttachment({ view: context })
        .withDepthStencilAttachment({ view: depth })
        .draw(3),
    ).toThrow('depth textures as attachments when rendering into a canvas');
  });

  it('throws for a view that is not an object', ({ gl }) => {
    const root = initWithGL({ gl });

    expect(() =>
      createPipeline(root)
        .withColorAttachment({ view: createColorTarget(root) })
        .withDepthStencilAttachment({
          view: undefined as unknown as DepthStencilAttachment['view'],
        })
        .draw(3),
    ).toThrow("got 'undefined'");
  });

  it('reuses the framebuffer and depth buffer of views created every frame', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = createColorTarget(root);
    const pipeline = createPipeline(root);

    for (let frame = 0; frame < 3; frame++) {
      pipeline
        .withColorAttachment({ view: color.createView('render') })
        .withDepthStencilAttachment({ view: placeholderView })
        .draw(3);
    }

    // One for the view on its own, one with the implicit depth buffer
    expect(gl.createFramebuffer).toHaveBeenCalledTimes(2);
    expect(gl.createRenderbuffer).toHaveBeenCalledTimes(1);
  });
});
