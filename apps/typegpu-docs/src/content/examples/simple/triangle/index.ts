import { computeShader } from '@typegpu/concurrent-sum';
import {
  dataBindGroupLayout,
  inputValueType,
} from './../../../../../../../packages/typegpu-concurrent-sum/src/schemas.ts';
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

const buffer = root.createBuffer(inputValueType, { in: Array.from({ length: 1024 }, (_, k) => k)} ).$usage('storage');
const fooBindGroup = root.createBindGroup(dataBindGroupLayout, {
  inputArray: buffer,
});

const getGradientColor = tgpu['~unstable'].fn([d.f32], d.vec4f)(
  /* wgsl */ `(ratio: f32) -> vec4f {
    return mix(purple, blue, ratio);
  }`,
).$uses({ purple, blue });

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

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
}) /* wgsl */`{
  return getGradientColor((in.uv[0] + in.uv[1]) / 2);
}
`.$uses({ getGradientColor });

const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline()
  .$name('compute');

const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

setTimeout(() => {
  computePipeline
    .with(dataBindGroupLayout, fooBindGroup)
    .dispatchWorkgroups(1);
  console.log('Compute shader dispatched');

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

    // read buffer
  buffer.read().then((result) => {
    console.log('Result:', result);
  }
  ).catch((error) => {
    console.error('Error reading buffer:', error);
  });
}, 100);

export function onCleanup() {
  root.destroy();
}
