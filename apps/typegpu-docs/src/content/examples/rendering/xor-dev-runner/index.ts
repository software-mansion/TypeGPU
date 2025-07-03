/**
 * This is a port of XorDev's "Runner" example using TypeGPU. Most of the shader is
 * written in TGSL (TypeScript + Standard Library), but parts of it are implemented
 * in WGSL to showcase the flexibility of TypeGPU.
 *
 * ## Credits
 * XorDev (xordev.com) for the idea and original implementation
 *
 * ## Original GLSL implementation
 * ```
 * vec3 q,p;for(float z,d,i,l;l++<3e1;z+=d,o+=.1*(vec4(4,2,1,0)-tanh(p.y+4.))*d/(1.+z)){p=z*normalize(FC.rgb*2.-r.xyy)-2.;p.xz-=t+3.;for(q=p,d=p.y,i=4e1;i>.01;i*=.2)d=max(d,min(min(q=i*.9-abs(mod(q,i+i)-i),q.y).x,q.z)),q.xz*=rotate2D(9.);}o=tanh(o*o);
 * ```
 */

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
// deno-fmt-ignore: just a list of standard functions
import { abs, add, cos, max, min, mul, normalize, select, sign, sin, sub, tanh } from 'typegpu/std';

// NOTE: Some APIs are still unstable (are being finalized based on feedback), but
//       we can still access them if we know what we're doing.
//       They're going to be moved into `tgpu.` and `root.` in a future version.

/**
 * For some reason, tanh in WebGPU breaks down hard outside
 * of the <10, -10> range.
 */
const safeTanh = tgpu.fn([d.f32], d.f32)((v) =>
  select(tanh(v), sign(v), abs(v) > 10)
);

// Functions can still be written in WGSL, if that's what you prefer.
// You can omit the argument and return types, and we'll generate them
// for you based on the function's shell.
/**
 * A modulo that replicates the behavior of GLSL's `mod` function.
 */
const mod = tgpu.fn([d.vec3f, d.f32], d.vec3f)`(v, a) {
  return fract(v / a) * a;
}`;

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in the XZ plane (around the Y axis)
 */
const rotateXZ = tgpu.fn([d.f32], d.mat3x3f)((angle) =>
  d.mat3x3f(
    /* right   */ d.vec3f(cos(angle), 0, sin(angle)),
    /* up      */ d.vec3f(0, 1, 0),
    /* forward */ d.vec3f(-sin(angle), 0, cos(angle)),
  )
);

// Roots are your GPU handle, and can be used to allocate memory, dispatch
// shaders, etc.
const root = await tgpu.init();

// Uniforms are used to send read-only data to the GPU
const time = root.createUniform(d.f32);
const scale = root.createUniform(d.f32);
const color = root.createUniform(d.vec3f);
const shift = root.createUniform(d.f32);
const aspectRatio = root.createUniform(d.f32);

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  // Increasing the color intensity
  const icolor = mul(color.$, 4);
  const ratio = d.vec2f(aspectRatio.$, 1);
  const dir = normalize(d.vec3f(mul(uv, ratio), -1));

  let acc = d.vec3f();
  let z = d.f32(0);
  for (let l = 0; l < 30; l++) {
    const p = sub(mul(z, dir), scale.$);
    p.x -= time.$ + 3;
    p.z -= time.$ + 3;
    let q = p;
    let prox = p.y;
    for (let i = 40.1; i > 0.01; i *= 0.2) {
      q = sub(i * 0.9, abs(sub(mod(q, i + i), i)));
      const minQ = min(min(q.x, q.y), q.z);
      prox = max(prox, minQ);
      q = mul(q, rotateXZ(shift.$));
    }
    z += prox;
    acc = add(acc, mul(sub(icolor, safeTanh(p.y + 4)), 0.1 * prox / (1 + z)));
  }

  // Tone mapping
  acc = tanh(mul(acc, acc));

  return d.vec4f(acc, 1);
});

/**
 * A full-screen triangle vertex shader
 */
const vertexMain = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
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
  .withVertex(vertexMain, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) {
    return;
  }

  aspectRatio.write(canvas.clientWidth / canvas.clientHeight);
  time.write((timestamp * 0.001) % 1000);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// #region Example controls and cleanup

export const controls = {
  scale: {
    initial: 2,
    min: -15,
    max: 100,
    step: 0.01,
    onSliderChange(v: number) {
      scale.write(v);
    },
  },
  'pattern shift': {
    initial: 155,
    min: 100,
    max: 200,
    step: 0.001,
    onSliderChange(v: number) {
      shift.write(v / 180 * Math.PI);
    },
  },
  color: {
    initial: [1, 0.7, 0],
    onColorChange(value: readonly [number, number, number]) {
      color.write(d.vec3f(...value));
    },
  },
};

export function onCleanup() {
  isRunning = false;
  root.destroy();
}

// #endregion
