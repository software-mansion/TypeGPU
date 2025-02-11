import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const getColor = tgpu['~unstable']
  .fn([d.f32], d.vec4f)
  .does(`(alpha: f32) -> vec4f {
    let color = vec4f(0.114, 0.447, 0.941, alpha);
    return color;
  }`)
  .$name('getColor');

const mainVertex = tgpu['~unstable']
  .vertexFn(
    { vertexIndex: d.builtin.vertexIndex },
    { outPos: d.builtin.position },
  )
  .does(/* wgsl */ `(input: VertexInput) -> VertexOutput {
    var pos = array<vec2f, 3>(
      vec2(0.0, 0.5),
      vec2(-0.5, -0.5),
      vec2(0.5, -0.5)
    );

    return VertexOutput(vec4f(pos[input.vertexIndex], 0.0, 1.0));
  }`);

const mainFragment = tgpu['~unstable']
  .fragmentFn({}, d.vec4f)
  .does(/* wgsl */ `() -> @location(0) vec4f {
    return getColor(1.0f);
  }`)
  .$uses({ getColor });

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
