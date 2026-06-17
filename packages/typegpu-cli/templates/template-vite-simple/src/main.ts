import tgpu, { common, d } from 'typegpu';

const root = await tgpu.init();

const canvas = document.querySelector<HTMLCanvasElement>('#canvas') as HTMLCanvasElement;
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

// Adjusting the resolution when the physical size of the canvas changes,
// and re-rendering the content.
common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    render();
  },
});
