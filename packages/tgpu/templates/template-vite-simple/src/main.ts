import tgpu, { common, d } from 'typegpu';

const root = await tgpu.init();

// oxlint-disable-next-line typescript/no-non-null-assertion
const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const context = root.configureContext({ canvas });

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    return d.vec4f(0.55, uv, 1);
  },
});

function render() {
  pipeline.withColorAttachment({ view: context }).draw(3);
}
const observer = new ResizeObserver(([entry]) => {
  if (!entry) {
    return;
  }
  const width =
    entry.devicePixelContentBoxSize?.[0].inlineSize ||
    entry.contentBoxSize[0].inlineSize * window.devicePixelRatio;
  const height =
    entry.devicePixelContentBoxSize?.[0].blockSize ||
    entry.contentBoxSize[0].blockSize * window.devicePixelRatio;
  canvas.width = Math.max(1, Math.min(width, root.device.limits.maxTextureDimension2D));
  canvas.height = Math.max(1, Math.min(height, root.device.limits.maxTextureDimension2D));
  render();
});
try {
  observer.observe(canvas, { box: 'device-pixel-content-box' });
} catch {
  observer.observe(canvas, { box: 'content-box' });
}
