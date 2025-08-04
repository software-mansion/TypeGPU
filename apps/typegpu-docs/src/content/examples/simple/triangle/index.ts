import { tgpu, type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';

// const purple = d.vec4f(0.769, 0.392, 1.0, 1);
// const blue = d.vec4f(0.114, 0.447, 0.941, 1);

// const getGradientColor = tgpu.fn([d.f32], d.vec4f) /* wgsl */`(ratio) {
//   return mix(purple, blue, ratio);
// }
// `.$uses({ purple, blue });

// const mainVertex = tgpu['~unstable'].vertexFn({
//   in: { vertexIndex: d.builtin.vertexIndex },
//   out: { outPos: d.builtin.position, uv: d.vec2f },
// }) /* wgsl */`{
//   var pos = array<vec2f, 3>(
//     vec2(0.0, 0.5),
//     vec2(-0.5, -0.5),
//     vec2(0.5, -0.5)
//   );

//   var uv = array<vec2f, 3>(
//     vec2(0.5, 1.0),
//     vec2(0.0, 0.0),
//     vec2(1.0, 0.0),
//   );

//   return Out(vec4f(pos[in.vertexIndex], 0.0, 1.0), uv[in.vertexIndex]);
// }`;

// const mainFragment = tgpu['~unstable'].fragmentFn({
//   in: { uv: d.vec2f },
//   out: d.vec4f,
// }) /* wgsl */`{
//   return getGradientColor((in.uv[0] + in.uv[1]) / 2);
// }
// `.$uses({ getGradientColor });

const root = await tgpu.init();

// const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
// const canvas = document.querySelector('canvas') as HTMLCanvasElement;
// const context = canvas.getContext('webgpu') as GPUCanvasContext;

// context.configure({
//   device: root.device,
//   format: presentationFormat,
//   alphaMode: 'premultiplied',
// });

// const pipeline = root['~unstable']
//   .withVertex(mainVertex, {})
//   .withFragment(mainFragment, { format: presentationFormat })
//   .createPipeline();

// setTimeout(() => {
//   pipeline
//     .withColorAttachment({
//       view: context.getCurrentTexture().createView(),
//       clearValue: [0, 0, 0, 0],
//       loadOp: 'clear',
//       storeOp: 'store',
//     })
//     .draw(3);
// }, 100);

export function onCleanup() {
  root.destroy();
}

// const buf = root.createBuffer(d.arrayOf(d.f32, 1)).$usage('storage');
// const val = buf.as('mutable');

// const f = tgpu['~unstable'].computeFn({
//   in: { gid: d.builtin.globalInvocationId },
//   workgroupSize: [1],
// })((input) => {
//   val.$[0] = 1 / 5;
// });

// const p1 = root['~unstable'].withCompute(f).createPipeline();
// const p2 = root['~unstable'].withCompute(f).createPipeline();
// p1.dispatchWorkgroups(1);
// p2.dispatchWorkgroups(1);

// const x = await buf.read();

// tgpu.resolve({ externals: { f } });

// console.log('START OF RECURSION RESOLVE');

let bar: TgpuFn;
let foo: TgpuFn;
bar = tgpu.fn([], d.f32)(() => foo() + 2);
foo = tgpu.fn([], d.f32)(() => bar() - 2);

tgpu.resolve({ externals: { foo } });
console.log('RESOLVE FROM MAIN INDEX FILE ABOVE');
