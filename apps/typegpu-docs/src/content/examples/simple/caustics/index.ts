import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { abs, add, clamp, cos, fract, max, mix, mul, pow, sin, sub } from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const timeUniform = root['~unstable'].createUniform(d.f32, Date.now() * 0.001);

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position, uv: d.vec2f },
})(({ vertexIndex }) => {
  const pos = [
    d.vec2f(0.0, 0.5),
    d.vec2f(-0.5, -0.5),
    d.vec2f(0.5, -0.5)
  ];

  const time = timeUniform.value;
  const outPos = pos[vertexIndex];
  const right = d.vec3f(sin(time), 0, cos(time));
  // const forward = d.vec3f(cos(time), 0, -sin(time));
  const outPos2 = add(mul(right, outPos.x), d.vec3f(0, outPos.y, 0.5));

  const uv = [
    d.vec2f(0.5, 1.0),
    d.vec2f(0.0, 0.0),
    d.vec2f(1.0, 0.0),
  ];

  return {
    outPos: d.vec4f(outPos, 0.0, 1.0),
    uv: uv[vertexIndex],
  };
});

const caustics = tgpu['~unstable'].fn([d.vec2f, d.f32], d.f32)((uv, time) => {
  const uv2 = add(uv, perlin3d.sample(d.vec3f(mul(uv, 1), time * 0.2)));
  const uv3 = mul(uv2, 1);
  const noise = 1 - abs(perlin3d.sample(d.vec3f(mul(uv3, 10), time)));
  return noise;
});

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const big = perlin3d.sample(d.vec3f(timeUniform.value * 0.1)) * 0.1;
  const angle = 0.2 + big;
  const right = d.vec2f(cos(angle), sin(angle));
  const up = d.vec2f(-sin(angle) * 10 + uv.x * 3, cos(angle) * 5);
  const ruv = add(mul(right, uv.x), mul(up, uv.y));
  const tileUv = fract(add(mul(ruv, 5), d.vec2f(0.5, 0.5)));
  const prox = abs(sub(mul(sub(1, tileUv), 2), 1));
  const maxProx = max(prox.x, prox.y);
  const tile = clamp(pow(1 - maxProx, 0.6) * 5, 0, 1);
  const albedo = mix(d.vec3f(0.1), d.vec3f(1), tile);

  const cuv = d.vec2f(uv.x, uv.y * 2);
  const c1 = caustics(cuv, timeUniform.value * 0.2);
  const c2 = caustics(mul(cuv, 2), timeUniform.value * 0.7);
  let caustics1 = d.vec3f(pow(c1, 4) * 0.3, pow(c1, 4) * 0.5, c1);
  let caustics2 = d.vec3f(pow(c2, 16) * 0.3, c2 * 0.5, pow(c2, 4) * 0.5);
  caustics1 = mul(caustics1, 1);
  caustics2 = mul(caustics2, 0.6);

  return d.vec4f(mul(albedo, add(caustics1, caustics2)), 1);
});

const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

function draw() {
  timeUniform.write((performance.now()) * 0.001 % 1000);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}

draw();

export function onCleanup() {
  root.destroy();
}
