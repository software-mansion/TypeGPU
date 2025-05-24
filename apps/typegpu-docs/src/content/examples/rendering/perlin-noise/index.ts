import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { perlin2d } from '@typegpu/noise';
import { mul } from 'typegpu/std';

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: pos[input.vertexIndex],
  };
});

const gridSizeAccess = tgpu['~unstable'].accessor(d.f32);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  // TODO: Use the value of gridSizeAccess directly after
  // we fix type inference of accessors.
  const gridSize = d.f32(gridSizeAccess.value);
  const n = perlin2d.sample(mul(gridSize, input.uv));
  return d.vec4f(d.vec3f(n * 0.5 + 0.5), 1);
});

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSizeUniform = root['~unstable'].createUniform(d.f32, 32);

const renderPipeline = root['~unstable']
  .with(gridSizeAccess, gridSizeUniform)
  .withVertex(fullScreenTriangle, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

const draw = async () => {
  const view = context.getCurrentTexture().createView();

  renderPipeline.withColorAttachment({
    view,
    loadOp: 'clear',
    storeOp: 'store',
  }).draw(3);
};

draw();

export const controls = {
  'grid size': {
    initial: '4',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      gridSizeUniform.write(Number.parseInt(value));
      draw();
    },
  },
};

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}
