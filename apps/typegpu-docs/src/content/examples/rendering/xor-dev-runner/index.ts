import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { abs, add, cos, max, min, mul, normalize, sin, sub } from 'typegpu/std';

const root = await tgpu.init();

const timeUniform = root['~unstable'].createUniform(d.f32);
const scaleUniform = root['~unstable'].createUniform(d.f32, 2);
const colorUniform = root['~unstable'].createUniform(d.vec3f);

/**
 * For some reason, tanh in WebGPU breaks down hard outside
 * of the <10, -10> range.
 */
const tanh = tgpu['~unstable'].fn([d.f32], d.f32)`(v) {
  return select(tanh(v), sign(v), abs(v) > 10);
}`;

// TODO: Implement tanh in `typegpu/std`
const tanh3 = tgpu['~unstable'].fn([d.vec3f], d.vec3f)`(v) {
  return tanh(v);
}`;

const mod = tgpu['~unstable'].fn([d.vec3f, d.f32], d.vec3f)`(v, a) {
  return fract(v / a) * a;
}`;

const rotateXZ = tgpu['~unstable'].fn([d.f32], d.mat3x3f)((angle) => {
  return d.mat3x3f(
    // right
    d.vec3f(cos(angle), 0, sin(angle)),
    // up
    d.vec3f(0, 1, 0),
    // forward
    d.vec3f(-sin(angle), 0, cos(angle)),
  );
});

/**
 * Credits: XorDev (xordev.com) for the idea and original implementation
 * Original GLSL implementation:
 * ```
 * vec3 q,p;for(float z,d,i,l;l++<3e1;z+=d,o+=.1*(vec4(4,2,1,0)-tanh(p.y+4.))*d/(1.+z)){p=z*normalize(FC.rgb*2.-r.xyy)-2.;p.xz-=t+3.;for(q=p,d=p.y,i=4e1;i>.01;i*=.2)d=max(d,min(min(q=i*.9-abs(mod(q,i+i)-i),q.y).x,q.z)),q.xz*=rotate2D(9.);}o=tanh(o*o);
 * ```
 */
const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const t = timeUniform.value;
  // Increasing the color intensity
  const color = mul(colorUniform.value, 4);
  const dir = normalize(d.vec3f(uv, -1));
  let acc = d.vec3f();

  let z = d.f32(0);
  let dd = d.f32(0);
  for (let l = d.u32(0); l < 30; l++) {
    const p = sub(mul(z, dir), scaleUniform.value);
    // p.xz-=t+3.;
    p.x -= t + 3;
    p.z -= t + 3;
    let q = p;
    dd = p.y;
    for (let i = d.f32(40); i > 0.01; i *= 0.2) {
      // q=i*.9-abs(mod(q,i+i)-i)
      q = sub(i * 0.9, abs(sub(mod(q, i + i), i)));
      // d=max(d,min(min(q=<...hoisted...>,q.y).x,q.z))
      dd = max(dd, min(min(q.x, q.y), q.z));
      q = mul(q, rotateXZ(9));
    }
    z += dd;
    acc = add(acc, mul(sub(color, tanh(p.y + 4)), 0.1 * dd / (1 + z)));
  }

  // Tone mapping
  acc = tanh3(mul(acc, acc));

  return d.vec4f(acc.xyz, 1);
});

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

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

function draw() {
  timeUniform.write((performance.now() * 0.001) % 1000);

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

export const controls = {
  scale: {
    initial: 2,
    min: -100,
    max: 100,
    step: 0.001,
    onSliderChange(v: number) {
      scaleUniform.write(v);
    },
  },
  color: {
    onColorChange(value: readonly [number, number, number]) {
      colorUniform.write(d.vec3f(...value));
    },
    initial: [1, 0.7, 0],
  },
};

export function onCleanup() {
  root.destroy();
}
