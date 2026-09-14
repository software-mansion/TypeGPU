import { tgpu, d, common } from 'typegpu';
import {
  PaintParams,
  Stroke,
  STROKES_PER_LAYER,
  prepareStrokes,
  paintFragment,
  strokeReadLayout,
  paintLayout,
  paintFrameLayout,
  strokeWriteLayout,
  underpaintLayout,
} from '../src/examples/image-processing/monocular-painting/shaders.ts';
import { expect, test } from 'vitest';

test('detects local changes and removes a departed foreground mark without disturbing idle paint', async () => {
  const root = await tgpu.init();
  try {
    const errors: string[] = [];
    root.device.addEventListener('uncapturederror', (event) => errors.push(event.error.message));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#666666';
    ctx.fillRect(0, 0, 1024, 1024);
    const image = root
      .createTexture({ size: [1024, 1024], format: 'rgba8unorm', mipLevelCount: 11 })
      .$usage('sampled', 'render');
    const surface = root.createTexture({ size: [1, 1], format: 'rgba8unorm' }).$usage('sampled');
    const sampler = root.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
    });
    const params = root
      .createBuffer(PaintParams, {
        uvTransform: d.mat2x2f.identity(),
        canvasSize: d.vec2f(256),
        spacing: 32,
        detail: 1.4,
        texture: 1,
        opacity: 1,
        normalInfluence: 0.9,
        swapAxes: 0,
        mirror: 0,
        mode: 0,
        resetPaint: 1,
        revealStep: 10,
      })
      .$usage('uniform');
    const strokes = root.createBuffer(d.arrayOf(Stroke, STROKES_PER_LAYER + 64)).$usage('storage');
    const group = root.createBindGroup(paintLayout, {
      params,
      surface: surface.createView(),
      sampler,
    });
    const writeGroup = root.createBindGroup(strokeWriteLayout, { strokes });
    const mipGroup = root.createBindGroup(underpaintLayout, { image: image.createView(), sampler });
    const pipeline = root.createComputePipeline({ compute: prepareStrokes });
    const history = root.createTexture({size: [256,256], format: 'rgba8unorm'}).$usage('sampled');
    const target = root.createTexture({size: [256,256], format: 'rgba8unorm'}).$usage('render');
    const grain = root.createTexture({size: [128,128], format: 'rgba8unorm'}).$usage('sampled');
    grain.write(new Uint8Array(128*128*4).fill(128));
    const paint = root.createRenderPipeline({vertex: common.fullScreenTriangle, fragment: paintFragment, targets: {format: 'rgba8unorm'}});
    const readGroup = root.createBindGroup(strokeReadLayout, {strokes, history, grain, grainSampler: sampler});
    let lastPixels = new Uint8Array();
    async function frame() {
      image.write(canvas);
      image.generateMipmaps();
      const source = new VideoFrame(canvas, { timestamp: 0 });
      const external = root.device.importExternalTexture({ source });
      pipeline
        .with(group)
        .with(writeGroup)
        .with(mipGroup)
        .with(root.createBindGroup(paintFrameLayout, { frame: external }))
        .dispatchWorkgroups(1, 1, 2);
      paint.with(group).with(mipGroup).with(readGroup)
        .with(root.createBindGroup(paintFrameLayout, {frame: external}))
        .withColorAttachment({view: target}).draw(3);
      const buffer = root.device.createBuffer({size: 256*256*4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
      const encoder = root.device.createCommandEncoder();
      encoder.copyTextureToTexture({texture: root.unwrap(target)}, {texture: root.unwrap(history)}, [256,256]);
      encoder.copyTextureToBuffer({texture: root.unwrap(target)}, {buffer, bytesPerRow: 1024}, [256,256]);
      root.device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      lastPixels = new Uint8Array(buffer.getMappedRange()).slice();
      buffer.unmap(); buffer.destroy();
      const all = await strokes.read();
      source.close();
      return [...all.slice(0, 16), ...all.slice(STROKES_PER_LAYER, STROKES_PER_LAYER + 64)];
    }
    const first = await frame();
    const originalPixels = lastPixels.slice();
    params.patch({ resetPaint: 0 });
    const quiet = await frame();
    ctx.fillStyle = '#cc4433';
    ctx.fillRect(0, 0, 512, 1024);
    const moved = await frame();
    const settled = await frame();
    const results = {
      first: first.filter((s) => s.dirty).length,
      quiet: quiet.filter((s) => s.dirty).length,
      moved: moved.filter((s) => s.dirty).length,
      farRight: moved.filter((s) => s.center.x > 208 && s.dirty).length,
      settled: settled.filter((s) => s.dirty).length,
      errors,
    };
    ctx.fillStyle = '#666666';
    ctx.fillRect(0, 0, 1024, 1024);
    await frame();
    // The departed object must leave no residual color, even in dry brush gaps.
    expect(lastPixels).toEqual(originalPixels);
    const restored = lastPixels.slice();
    await frame();
    expect(lastPixels).toEqual(restored);
    // Animation keeps a stationary stroke active until it finishes, then stops.
    params.patch({ resetPaint: 1, revealStep: 0.25 });
    const start = await frame();
    params.patch({ resetPaint: 0 });
    const middle = await frame();
    await frame();
    const end = await frame();
    expect(start.every((s) => s.progress >= 0.1 && s.progress <= 0.2)).toBe(true);
    expect(new Set(start.map((s) => s.progress)).size).toBeGreaterThan(1);
    expect(middle.every((s, i) => Math.abs(s.progress - start[i].progress - 0.25) < 0.00001)).toBe(true);
    expect(end.every((s) => s.progress >= 0.85 && s.progress <= 0.95)).toBe(true);
    const complete = await frame();
    const idle = await frame();
    expect(complete.every((s) => s.progress === 1 && s.dirty === 1)).toBe(true);
    expect(idle.every((s) => s.dirty === 0)).toBe(true);
    // At 200 FPS the first frame is still inside every stroke's delay.
    params.patch({ resetPaint: 1, revealStep: 0.05 });
    const delayed = await frame();
    expect(delayed.every((s) => s.progress <= 0 && s.previousProgress === 0)).toBe(true);
    expect(results.first).toBe(80);
    expect(results.quiet).toBe(0);
    expect(results.moved).toBeGreaterThan(0);
    expect(results.moved).toBeLessThan(80);
    expect(results.farRight).toBe(0);
    expect(results.settled).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    root.destroy();
  }
});
