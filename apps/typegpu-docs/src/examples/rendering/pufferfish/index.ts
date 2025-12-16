import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { fullScreenTriangle } from 'typegpu/common';
import {
  fullColorFragment,
  sdfDebugFragment,
  Uniforms,
  uniformsAccess,
} from './shader.ts';
import { mat4 } from 'wgpu-matrix';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

export const uniforms = root.createUniform(Uniforms, {
  invProjMat: d.mat4x4f(),
  invModelMat: d.mat4x4f(),
  color: d.vec4f(1, 0, 0, 0),
  face_oval: d.vec4f(0),
  head_pitch: 0,
  head_yaw: 0,
  spike_height: 0.1,
  time: 0,
});

const fullColorRenderPipeline = root['~unstable']
  .with(uniformsAccess, uniforms)
  .withVertex(fullScreenTriangle)
  .withFragment(fullColorFragment, { format: presentationFormat })
  .createPipeline();

const sdfDebugRenderPipeline = root['~unstable']
  .with(uniformsAccess, uniforms)
  .withVertex(fullScreenTriangle)
  .withFragment(sdfDebugFragment, { format: presentationFormat })
  .createPipeline();

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) {
    return;
  }

  const invProjMat = mat4.identity(d.mat4x4f());
  const scale = Math.max(1, canvas.height / canvas.width);
  const aspect = canvas.width / canvas.height;
  mat4.scale(invProjMat, [aspect * scale, scale, 1], invProjMat);

  const invModelMat = mat4.identity(d.mat4x4f());
  // mat4.translate(invModelMat, [0, 0, 0], invModelMat);
  const headPitch = Math.sin(timestamp * 0.001) * 0.2;
  const headYaw = Math.sin(timestamp * 0.0023) * 0.2;
  mat4.rotateY(invModelMat, headYaw, invModelMat);
  mat4.rotateX(invModelMat, headPitch, invModelMat);

  uniforms.writePartial({
    invProjMat,
    invModelMat,
    time: timestamp * 0.001 % 1000,
  });
  sdfDebugRenderPipeline
    .withColorAttachment({
      loadOp: 'clear',
      storeOp: 'store',
      view: context.getCurrentTexture().createView(),
    })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

export const controls = {};

export function onCleanup() {
  isRunning = false;
  root.destroy();
}
