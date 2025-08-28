import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { BPETER, HybridTaus, randf, randomGeneratorSlot } from '@typegpu/noise';

const root = await tgpu.init();

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

const gridSize = 100;

const b1 = root.createBuffer(d.arrayOf(d.u32, gridSize * gridSize)).$usage(
  'storage',
);
const b2 = root.createBuffer(d.arrayOf(d.f32, gridSize * gridSize)).$usage(
  'storage',
);

const layout = tgpu.bindGroupLayout({
  u: {
    storage: d.arrayOf(d.u32, gridSize * gridSize),
    access: 'mutable',
    visibility: ['fragment'],
  },
  f: {
    storage: d.arrayOf(d.f32, gridSize * gridSize),
    access: 'mutable',
    visibility: ['fragment'],
  },
});

const group = root.createBindGroup(layout, {
  u: b1,
  f: b2,
});

// === Floater ===
const floater = tgpu.fn([d.u32], d.f32)`(val){
  let exponent: u32 = 0x3f800000;
  let mantissa: u32 = 0x007fffff & val;
  var ufloat: u32 = (exponent | mantissa);
  return bitcast<f32>(ufloat) - 1f;
}`;

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = input.uv.add(d.f32(1)).div(d.f32(2));
  const grided = std.floor(uv.mul(gridSize));
  const id = d.u32(grided.x * gridSize + grided.y);
  // randf.seed2(grided.div(gridSize));
  randf.iSeed(id);
  randf.seed2(uv);
  // randf.seed(d.f32(id) / 10000);
  // randf.seed2(grided);
  // randf.iSeed2(d.vec2u(grided));
  const sample = randf.sample();

  // layout.bound.u.$[id] = sample;
  // layout.bound.f.$[id] = floater(sample);

  return d.vec4f(d.vec3f(sample), 1.0);
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
  .with(layout, group)
  .withColorAttachment({
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
  })
  .draw(3);

console.log(tgpu.resolve({ externals: { pipeline } }));

// console.log('our grid u32', await b1.read());
// console.log('our grid f32', await b2.read());

const b = root.createMutable(d.f32);
const f = tgpu['~unstable'].computeFn({ workgroupSize: [1] })`{
  b = floater(0xffffffff);
}`.$uses({ b, floater });

const p = root['~unstable'].withCompute(f)
  .createPipeline();
p.dispatchWorkgroups(1);

console.log(tgpu.resolve({ externals: { f } }));

console.log('some tests:', await b.read());

export function onCleanup() {
  root.destroy();
}
