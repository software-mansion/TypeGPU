import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const purple = d.vec4f(0.769, 0.392, 1.0, 1);
const blue = d.vec4f(0.114, 0.447, 0.941, 1);

const getGradientColor = (ratio: number) => {
  'use gpu';
  return std.mix(purple, blue, ratio);
};

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
}) /* wgsl */`{
  var pos = array<vec2f, 3>(
    vec2(0.0, 0.5),
    vec2(-0.5, -0.5),
    vec2(0.5, -0.5)
  );

  var uv = array<vec2f, 3>(
    vec2(0.5, 1.0),
    vec2(0.0, 0.0),
    vec2(1.0, 0.0),
  );

  return Out(vec4f(pos[in.vertexIndex], 0.0, 1.0), uv[in.vertexIndex]);
}`;

const root = await tgpu.init();

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable'].createRenderPipeline({
  vertex: mainVertex,
  fragment: ({ uv }) => {
    'use gpu';
    return getGradientColor((uv.x + uv.y) / 2);
  },
  targets: { format: presentationFormat },
});

pipeline
  .withColorAttachment({
    view: context.getCurrentTexture().createView(),
    clearValue: [0, 0, 0, 0],
    loadOp: 'clear',
    storeOp: 'store',
  })
  .draw(3);

export function onCleanup() {
  root.destroy();
}
