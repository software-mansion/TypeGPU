import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { fullScreenTriangle } from 'typegpu/common';
import {
  frequentLayout,
  fullColorFragment,
  samplerSlot,
  sdfDebugFragment,
  Uniforms,
  uniformsAccess,
} from './shader.ts';
import { mat4 } from 'wgpu-matrix';
import { createPufferfishController } from './pufferfish-controller.ts';

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

const pufferfishController = await createPufferfishController();
const video = document.querySelector('video') as HTMLVideoElement;

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    },
  });
} else {
  throw new Error('getUserMedia not supported');
}

const visualModes = [
  'Full-color',
  'Distance',
] as const;

type VisualMode = typeof visualModes[number];

const uniforms = root.createUniform(Uniforms, {
  invProjMat: d.mat4x4f(),
  invModelMat: d.mat4x4f(),
  color: d.vec4f(0.8, 0.2, 1, 0),
  face_oval: d.vec4f(0),
  head_pitch: 0,
  head_yaw: 0,
  spike_height: 0.1,
  time: 0,
});

const sampler = root['~unstable'].createSampler({});

const fullColorRenderPipeline = root['~unstable']
  .with(uniformsAccess, uniforms)
  .with(samplerSlot, sampler)
  .withVertex(fullScreenTriangle)
  .withFragment(fullColorFragment, { format: presentationFormat })
  .createPipeline();

const sdfDebugRenderPipeline = root['~unstable']
  .with(uniformsAccess, uniforms)
  .withVertex(fullScreenTriangle)
  .withFragment(sdfDebugFragment, { format: presentationFormat })
  .createPipeline();

let isRunning = true;
let visualMode: VisualMode = visualModes[0];

let lastTime = performance.now();
function draw(timestamp: number) {
  if (!isRunning) {
    return;
  }

  const deltaTime = (timestamp - lastTime) * 0.001;
  lastTime = timestamp;

  if (video.readyState < 2) {
    requestAnimationFrame(draw);
    return;
  }

  pufferfishController.update(deltaTime);

  const invProjMat = mat4.identity(d.mat4x4f());
  const scale = Math.max(1, canvas.height / canvas.width);
  const aspect = canvas.width / canvas.height;
  const puffScale = 1.5 - pufferfishController.sizeSpring.value * 0.2;
  mat4.scale(invProjMat, [aspect * scale, scale, 1], invProjMat);
  mat4.scale(invProjMat, d.vec3f(puffScale, puffScale, 1), invProjMat);

  const invModelMat = mat4.identity(d.mat4x4f());
  mat4.rotateY(invModelMat, pufferfishController.headYaw, invModelMat);
  mat4.rotateX(invModelMat, -pufferfishController.headPitch, invModelMat);

  const videoTexture = device.importExternalTexture({ source: video });
  const frequentGroup = root.createBindGroup(frequentLayout, {
    video: videoTexture,
  });

  const faceOval = pufferfishController.faceLandmarks?.faceOval;
  uniforms.writePartial({
    invProjMat,
    invModelMat,
    time: timestamp * 0.001 % 1000,
    face_oval: d.vec4f(
      faceOval?.xMin ?? 0,
      faceOval?.yMin ?? 0,
      faceOval?.xMax ?? 1,
      faceOval?.yMax ?? 1,
    ),
    spike_height: 0.1 + pufferfishController.sizeSpring.value * 0.3,
  });

  if (visualMode === 'Full-color') {
    fullColorRenderPipeline
      .with(frequentGroup)
      .withColorAttachment({
        loadOp: 'clear',
        storeOp: 'store',
        view: context.getCurrentTexture().createView(),
      })
      .draw(3);
  } else {
    sdfDebugRenderPipeline
      .withColorAttachment({
        loadOp: 'clear',
        storeOp: 'store',
        view: context.getCurrentTexture().createView(),
      })
      .draw(3);
  }

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

//
// Face Detection
//

let videoFrameCallbackId: number | undefined;

function processVideoFrame(
  _: number,
  metadata: VideoFrameCallbackMetadata,
) {
  if (video.readyState < 2) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  pufferfishController.updatePuffScore(video);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

export const controls = {
  Visualization: {
    initial: visualModes[0],
    options: visualModes,
    onSelectChange(value: VisualMode) {
      visualMode = value;
    },
  },
};

export function onCleanup() {
  isRunning = false;
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }
  root.destroy();
}
