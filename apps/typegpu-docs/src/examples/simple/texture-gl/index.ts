import { initWithGL } from '@typegpu/gl';
import { d, std, tgpu } from 'typegpu';

const root = initWithGL();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const positions = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(-1, -1),
  d.vec2f(3, -1),
  d.vec2f(-1, 3),
]);

const fullscreenVertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f },
})(({ index }) => {
  'use gpu';
  const position = positions.$[index];
  return {
    position: d.vec4f(position, 0, 1),
    uv: position * 0.5 + 0.5,
  };
});

const paletteTexture = root.createTexture({ size: [4, 4], format: 'rgba8unorm' }).$usage('sampled');

paletteTexture.write(
  new Uint8Array([
    255, 94, 120, 255, 255, 190, 92, 255, 80, 220, 190, 255, 91, 132, 255, 255, 255, 190, 92, 255,
    80, 220, 190, 255, 91, 132, 255, 255, 188, 94, 255, 255, 80, 220, 190, 255, 91, 132, 255, 255,
    188, 94, 255, 255, 255, 94, 120, 255, 91, 132, 255, 255, 188, 94, 255, 255, 255, 94, 120, 255,
    255, 190, 92, 255,
  ]),
);

const paletteView = paletteTexture.createView();
const sampler = root.createSampler({
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  magFilter: 'nearest',
  minFilter: 'nearest',
});

const surfaceTexture = root
  .createTexture({ size: [128, 128], format: 'rgba8unorm' })
  .$usage('render', 'sampled');
const surfaceRenderView = surfaceTexture.createView('render');
const surfaceSampledView = surfaceTexture.createView();

const paintSurface = root.createRenderPipeline({
  vertex: fullscreenVertex,
  targets: { format: 'rgba8unorm' },
  fragment: ({ uv }) => {
    'use gpu';
    const warpedUv = uv * 4 + d.vec2f(std.sin(uv.y * 18), std.cos(uv.x * 18)) * 0.12;
    return std.textureSample(paletteView.$, sampler.$, warpedUv);
  },
});

const showSurface = root.createRenderPipeline({
  vertex: fullscreenVertex,
  fragment: ({ uv }) => {
    'use gpu';
    const centered = uv - 0.5;
    const lens = centered * (1 + std.length(centered) * 0.18) + 0.5;
    return std.textureSample(surfaceSampledView.$, sampler.$, lens);
  },
});

function frame() {
  requestAnimationFrame(frame);

  paintSurface.withColorAttachment({ view: surfaceRenderView }).draw(3);
  showSurface.withColorAttachment({ view: context }).draw(3);
}

requestAnimationFrame(frame);

export function onCleanup() {
  root.destroy();
}
