import tgpu, { d } from 'typegpu';

const purple = d.vec4f(0.769, 0.392, 1.0, 1);
const blue = d.vec4f(0.114, 0.447, 0.941, 1);

const getGradientColor = tgpu.fn([d.f32], d.vec4f) /* wgsl */`(ratio) {
  return mix(purple, blue, ratio);
}
`.$uses({ purple, blue });

const mainVertex = tgpu.vertexFn({
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

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
}) /* wgsl */`{
  return getGradientColor((in.uv[0] + in.uv[1]) / 2);
}
`.$uses({ getGradientColor });

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const pipeline = root.createRenderPipeline({
  vertex: mainVertex,
  fragment: mainFragment,
});

setTimeout(() => {
  pipeline
    .withColorAttachment({ view: context })
    .draw(3);
}, 100);

export function onCleanup() {
  root.destroy();
}
