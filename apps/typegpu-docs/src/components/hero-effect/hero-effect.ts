import tgpu from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';

interface HeroEffectOptions {
  signal: AbortSignal;
  canvas: HTMLCanvasElement;
}

export async function initHeroEffect(options: HeroEffectOptions) {
  const root = await tgpu.init();
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  if (options.signal.aborted) {
    root.destroy();
    return;
  }

  const ctx = options.canvas.getContext('webgpu');
  if (!ctx) {
    throw new Error('WebGPU context not available');
  }

  ctx.configure({
    device: root.device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  const resolution = [
    options.canvas.width * window.devicePixelRatio,
    options.canvas.height * window.devicePixelRatio,
  ];
  const observer = new ResizeObserver((entries) => {
    const entry = entries.find((entry) => entry.target === options.canvas);
    if (!entry) return;

    resolution[0] = entry.devicePixelContentBoxSize[0].inlineSize;
    resolution[1] = entry.devicePixelContentBoxSize[0].blockSize;
    options.canvas.width = resolution[0];
    options.canvas.height = resolution[1];
    console.log('Canvas resized:', resolution);
  });
  observer.observe(options.canvas);

  const fragmentFn = tgpu['~unstable'].fragmentFn({
    out: d.vec4f,
  })(() => {
    return d.vec4f(1, 0, 0, 1);
  });

  const renderPipeline = root['~unstable']
    .withVertex(fullScreenTriangle)
    .withFragment(fragmentFn, { format: presentationFormat })
    .createPipeline();

  const frame = (_timestamp: number) => {
    if (options.signal.aborted) {
      root.destroy();
      return;
    }

    renderPipeline.withColorAttachment({
      view: ctx.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    }).draw(3);

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
