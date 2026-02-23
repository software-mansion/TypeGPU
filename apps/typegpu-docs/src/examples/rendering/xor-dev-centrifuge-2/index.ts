/**
 * This is a port of XorDev's "Centrifuge 2" example using TypeGPU.
 *
 * ## Credits
 * XorDev (xordev.com) for the idea and original implementation
 *
 * ## Original GLSL implementation
 * ```
 * vec3 p,P;for(float z,d,i;i++<5e1;z+=d,o+=(1.2-cos(p.z/vec4(5,1e8,3,0)))/d)p=z*normalize(FC.rgb*2.-r.xyy),P=vec3(atan(p.y-=7.,p.x)/.1+t,p.z*.2-5.*t,length(p.xy)-11.),d=length(vec4(P.z,cos(P+cos(P/.2))-1.))*.5-.1;o=tanh(o/2e2);
 * ```
 */

import tgpu, { d } from 'typegpu';
// deno-fmt-ignore: just a list of standard functions
import { abs, atan2, cos, gt, length, normalize, select, sign, sub, tanh } from 'typegpu/std';
import { defineControls } from '../../common/defineControls.ts';

// NOTE: Some APIs are still unstable (are being finalized based on feedback), but
//       we can still access them if we know what we're doing.
//       They're going to be moved into `tgpu.` and `root.` in a future version.

/**
 * For some reason, tanh in WebGPU breaks down hard outside
 * of the <10, -10> range.
 */
const safeTanh = (v: d.v3f) => {
  'use gpu';
  return select(tanh(v), sign(v), gt(abs(v), d.vec3f(10)));
};

// Roots are your GPU handle, and can be used to allocate memory, dispatch
// shaders, etc.
const root = await tgpu.init();

// Uniforms are used to send read-only data to the GPU
const time = root.createUniform(d.f32);
const aspectRatio = root.createUniform(d.f32);

const cameraPos = root.createUniform(d.vec2f);
const tunnelDepth = root.createUniform(d.i32);
const bigStrips = root.createUniform(d.f32);
const smallStrips = root.createUniform(d.f32);
const dollyZoom = root.createUniform(d.f32);
const color = root.createUniform(d.vec3f);

const tunnelRadius = 11;
const moveSpeed = 5;

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const ratio = d.vec2f(aspectRatio.$, 1);
  const dir = normalize(d.vec3f(uv.mul(ratio), -1));

  let z = d.f32(0);
  let acc = d.vec3f();
  for (let i = 0; i < tunnelDepth.$; i++) {
    const p = dir.mul(z);
    p.x += cameraPos.$.x;
    p.y += cameraPos.$.y;

    const coords = d.vec3f(
      atan2(p.y, p.x) * bigStrips.$ + time.$,
      p.z * dollyZoom.$ - moveSpeed * time.$,
      length(p.xy) - tunnelRadius,
    );

    const coords2 = cos(coords.add(cos(coords.mul(smallStrips.$)))).sub(1);
    const dd = length(d.vec4f(coords.z, coords2)) * 0.5 - 0.1;

    acc = acc.add(sub(1.2, cos(color.$.mul(p.z))).div(dd));
    z += dd;
  }

  // Tone mapping
  acc = safeTanh(acc.mul(0.005));

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

const pipeline = root.createRenderPipeline({
  vertex: vertexMain,
  fragment: fragmentMain,
});

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) return;

  aspectRatio.write(canvas.clientWidth / canvas.clientHeight);
  time.write((timestamp * 0.001) % 1000);

  pipeline
    .withColorAttachment({ view: context })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// #region Example controls and cleanup

export const controls = defineControls({
  'tunnel depth': {
    initial: 50,
    min: 10,
    max: 200,
    step: 1,
    onSliderChange(v: number) {
      tunnelDepth.write(v);
    },
  },
  'big strips': {
    initial: 10,
    min: 1,
    max: 60,
    step: 0.01,
    onSliderChange(v: number) {
      bigStrips.write(v);
    },
  },
  'small strips': {
    initial: 5,
    min: 1,
    max: 10,
    step: 0.01,
    onSliderChange(v: number) {
      smallStrips.write(v);
    },
  },
  'dolly zoom': {
    initial: 0.2,
    min: 0.01,
    max: 1,
    step: 0.01,
    onSliderChange(v: number) {
      dollyZoom.write(v);
    },
  },
  'camera pos': {
    min: d.vec2f(-10, -10),
    max: d.vec2f(10, 10),
    initial: d.vec2f(0, -7),
    step: d.vec2f(0.01, 0.01),
    onVectorSliderChange(v) {
      cameraPos.write(v);
    },
  },
  color: {
    initial: d.vec3f(0.2, 0, 0.3),
    onColorChange(value) {
      color.write(value);
    },
  },
});

export function onCleanup() {
  isRunning = false;
  root.destroy();
}

// #endregion
