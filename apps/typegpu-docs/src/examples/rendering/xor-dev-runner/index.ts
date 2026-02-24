/**
 * This is a port of XorDev's "Runner" example using TypeGPU. Most of the shader is
 * written in TypeScript, but parts of it are implemented in WGSL to showcase the
 * flexibility of TypeGPU.
 *
 * ## Credits
 * XorDev (xordev.com) for the idea and original implementation
 *
 * ## Original GLSL implementation
 * ```
 * vec3 q,p;for(float z,d,i,l;l++<3e1;z+=d,o+=.1*(vec4(4,2,1,0)-tanh(p.y+4.))*d/(1.+z)){p=z*normalize(FC.rgb*2.-r.xyy)-2.;p.xz-=t+3.;for(q=p,d=p.y,i=4e1;i>.01;i*=.2)d=max(d,min(min(q=i*.9-abs(mod(q,i+i)-i),q.y).x,q.z)),q.xz*=rotate2D(9.);}o=tanh(o*o);
 * ```
 */

import tgpu, { d, std } from 'typegpu';
// deno-fmt-ignore: just a list of standard functions
import { abs, add, cos, max, min, mul, select, sign, sin, sub, tanh } from 'typegpu/std';
import { defineControls } from '../../common/defineControls.ts';
import {
  Camera,
  setupFirstPersonCamera,
} from '../../common/setup-first-person-camera.ts';

// NOTE: Some APIs are still unstable (are being finalized based on feedback), but
//       we can still access them if we know what we're doing.
//       They're going to be moved into `tgpu.` and `root.` in a future version.

/**
 * For some reason, tanh in WebGPU breaks down hard outside
 * of the <10, -10> range.
 */
const safeTanh = (v: number) => {
  'use gpu';
  return select(tanh(v), sign(v), abs(v) > 10);
};

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

export const Ray = d.struct({
  origin: d.vec4f,
  direction: d.vec4f,
});

/**
 * Returns a ray direction and ray origin for given uv,
 * in accordance to camera.
 */
const getRayForUV = (uv: d.v2f) => {
  'use gpu';
  const camera = cameraUniform.$;
  const farView = camera.projectionInverse.mul(d.vec4f(uv, 1, 1));
  const farWorld = camera.viewInverse.mul(
    d.vec4f(farView.xyz.div(farView.w), 1),
  );
  const direction = std.normalize(farWorld.xyz.sub(camera.pos.xyz));
  return Ray({ origin: camera.pos, direction: d.vec4f(direction, 0) });
};

// Roots are your GPU handle, and can be used to allocate memory, dispatch
// shaders, etc.
const root = await tgpu.init();

// Uniforms are used to send read-only data to the GPU
const autoMoveOffsetUniform = root.createUniform(d.vec3f);
const controlsOffsetUniform = root.createUniform(d.f32);
const colorUniform = root.createUniform(d.vec3f);
const shiftUniform = root.createUniform(d.f32);

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  // Increasing the color intensity
  const icolor = mul(colorUniform.$, 4);

  // Calculate ray direction based on UV and camera orientation
  const ray = getRayForUV(uv);

  let acc = d.vec3f();
  let z = d.f32(0);
  for (let l = 0; l < 30; l++) {
    const p = d.vec3f(3, 0, 3)
      .add(controlsOffsetUniform.$)
      .add(autoMoveOffsetUniform.$)
      .add(ray.origin.xyz)
      .add(mul(ray.direction.xyz, z));
    let q = d.vec3f(p);
    let prox = p.y;
    for (let i = 40.1; i > 0.01; i *= 0.2) {
      q = sub(i * 0.9, abs(sub(mod(q, i + i), i)));
      const minQ = min(min(q.x, q.y), q.z);
      prox = max(prox, minQ);
      q = mul(q, rotateXZ(shiftUniform.$));
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
const vertexMain = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: pos[input.vertexIndex],
  };
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const cameraUniform = root.createUniform(Camera);
const { cleanupCamera, updatePosition } = setupFirstPersonCamera(canvas, {
  speed: d.vec3f(0.001, 0.1, 1),
}, (props) => {
  cameraUniform.writePartial(props);
});

const pipeline = root.createRenderPipeline({
  vertex: vertexMain,
  fragment: fragmentMain,
});

let isRunning = true;
let autoMove = true;
let autoMoveOffset = d.vec3f();

function draw() {
  if (!isRunning) {
    return;
  }

  if (autoMove && !document.pointerLockElement) {
    autoMoveOffset = autoMoveOffset.add(d.vec3f(0.01, 0, 0.01));
    autoMoveOffsetUniform.write(autoMoveOffset);
  }
  updatePosition();

  pipeline
    .withColorAttachment({ view: context })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// #region Example controls and cleanup

export const controls = defineControls({
  'auto move': {
    initial: autoMove,
    onToggleChange(newValue) {
      autoMove = newValue;
    },
  },
  offset: {
    initial: 2,
    min: -100,
    max: 15,
    step: 0.01,
    onSliderChange(v) {
      controlsOffsetUniform.write(v);
    },
  },
  'pattern shift': {
    initial: 155,
    min: 100,
    max: 200,
    step: 0.001,
    onSliderChange(v) {
      shiftUniform.write(v / 180 * Math.PI);
    },
  },
  color: {
    initial: d.vec3f(1, 0.7, 0),
    onColorChange(value) {
      colorUniform.write(value);
    },
  },
});

export function onCleanup() {
  isRunning = false;
  cleanupCamera();
  root.destroy();
}

// #endregion
