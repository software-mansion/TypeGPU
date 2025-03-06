import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const purple = d.vec4f(0.769, 0.392, 1.0, 1);
const blue = d.vec4f(0.114, 0.447, 0.941, 1);

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const getGradientColor = tgpu['~unstable']
  .fn([d.f32], d.vec4f)
  .does(/* wgsl */ `(ratio: f32) -> vec4f {
    let color = mix(purple, blue, ratio);
    return color;
  }`)
  .$uses({ purple, blue })
  .$name('getGradientColor');

const mainVertex = tgpu['~unstable']
  .vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex },
    out: { outPos: d.builtin.position, uv: d.vec2f },
  })
  .does(/* wgsl */ `(input: VertexInput) -> VertexOutput {
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

    return VertexOutput(vec4f(pos[input.vertexIndex], 0.0, 1.0), uv[input.vertexIndex]);
  }`);

const mainFragment = tgpu['~unstable']
  .fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })
  .does(/* wgsl */ `(input: FragmentInput) -> @location(0) vec4f {
    return getGradientColor((input.uv[0] + input.uv[1]) / 2);
  }`)
  .$uses({ getGradientColor });

const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

pipeline
  .withColorAttachment({
    view: context.getCurrentTexture().createView(),
    clearValue: [0, 0, 0, 0],
    loadOp: 'clear',
    storeOp: 'store',
  })
  .draw(3);

root['~unstable'].flush();
root.destroy();
