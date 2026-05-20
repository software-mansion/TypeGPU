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

const resizeObserver = new ResizeObserver(() => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;

  pipeline.withColorAttachment({ view: context }).draw(3);
});
resizeObserver.observe(canvas);
