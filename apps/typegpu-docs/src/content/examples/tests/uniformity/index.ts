import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { BPETER, HybridTaus, randf, randomGeneratorSlot } from '@typegpu/noise';
import { HittableType } from 'morphcharts/dist/renderers/raytracewebgpu/hittable';

const root = await tgpu.init();

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: std.mul(0.5, pos[input.vertexIndex]),
  };
});

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = std.abs(input.uv);
  const grided = d.vec2i(uv.mul(100));
  randf.seed2(d.vec2f(grided).div(d.f32(std.max(grided.x, grided.y))));
  // randf.seed2(uv);
  return d.vec4f(d.vec3f(randf.sample()), 1.0);
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable']
  .with(randomGeneratorSlot, HybridTaus)
  .withVertex(fullScreenTriangle, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

pipeline
  .withColorAttachment({
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
  })
  .draw(3);

export function onCleanup() {
  root.destroy();
}

// const b = root.createMutable(d.f32);
// const f = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {
//   randf.seed2(d.vec2f(1, 0));
//   b.$ = randf.sample();
// });

// const p = root['~unstable'].with(randomGeneratorSlot, HybridTaus).withCompute(f)
//   .createPipeline();
// p.dispatchWorkgroups(1);

// console.log(await b.read());
