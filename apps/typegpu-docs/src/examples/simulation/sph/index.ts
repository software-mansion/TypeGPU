import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';
import * as m from 'wgpu-matrix';

const root = await tgpu.init({
  device: {
    optionalFeatures: ['float32-filterable'],
  },
});
const canFilter = root.enabledFeatures.has('float32-filterable');
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const VOLUME_SIZE = 256;
const NUM_AGENTS = 800_000;
const AGENT_WORKGROUP_SIZE = 64;
const BLUR_WORKGROUP_SIZE = [4, 4, 4];

const CAMERA_FOV_DEGREES = 60;
const CAMERA_DISTANCE_MULTIPLIER = 1.5;
const CAMERA_INITIAL_ANGLE = Math.PI / 4;

const RAYMARCH_STEPS = 128;
const DENSITY_MULTIPLIER = 0.05;

const RANDOM_DIRECTION_WEIGHT = 0.3;
const CENTER_BIAS_WEIGHT = 0.7;

const DEFAULT_MOVE_SPEED = 30.0;
const DEFAULT_SENSOR_ANGLE = 0.5;
const DEFAULT_SENSOR_DISTANCE = 9.0;
const DEFAULT_TURN_SPEED = 10.0;
const DEFAULT_EVAPORATION_RATE = 0.05;

const resolution = d.vec3f(VOLUME_SIZE);

const Camera = d.struct({
  viewProj: d.mat4x4f,
  invViewProj: d.mat4x4f,
  position: d.vec3f,
});

const cameraTarget = resolution.div(2);
const cameraUp = d.vec3f(0, 1, 0);
const fov = (CAMERA_FOV_DEGREES * Math.PI) / 180;
const aspect = canvas.width / canvas.height;
const near = 0.1;
const far = 1000.0;

let cameraDistance = Math.max(resolution.x, resolution.y, resolution.z) *
  CAMERA_DISTANCE_MULTIPLIER;
let cameraTheta = CAMERA_INITIAL_ANGLE; // azimuth
let cameraPhi = CAMERA_INITIAL_ANGLE; // elevation

const updateCamera = () => {
  const cameraPos = cameraTarget.add(d.vec3f(
    cameraDistance * Math.sin(cameraPhi) * Math.cos(cameraTheta),
    cameraDistance * Math.cos(cameraPhi),
    cameraDistance * Math.sin(cameraPhi) * Math.sin(cameraTheta),
  ));

  const view = m.mat4.lookAt(cameraPos, cameraTarget, cameraUp, d.mat4x4f());
  const proj = m.mat4.perspective(fov, aspect, near, far, d.mat4x4f());
  const viewProj = m.mat4.mul(proj, view, d.mat4x4f());
  const invViewProj = m.mat4.invert(viewProj, d.mat4x4f());

  cameraData.write({
    viewProj,
    invViewProj,
    position: cameraPos,
  });
};

const cameraData = root.createUniform(Camera, {
  viewProj: d.mat4x4f.identity(),
  invViewProj: d.mat4x4f.identity(),
  position: d.vec3f(),
});

updateCamera();

// #region Example controls and cleanup

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const handleCameraRotation = (deltaX: number, deltaY: number) => {
  cameraTheta -= deltaX * 0.01;
  cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + deltaY * 0.01));
  updateCamera();
};

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;

  handleCameraRotation(deltaX, deltaY);

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
  isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cameraDistance *= 1 + e.deltaY * 0.001;
  cameraDistance = Math.max(
    100,
    Math.min(
      cameraDistance,
      Math.max(resolution.x, resolution.y, resolution.z) * 3,
    ),
  );
  updateCamera();
}, { passive: false });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDragging = true;
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!isDragging || e.touches.length !== 1) return;

  const deltaX = e.touches[0].clientX - lastMouseX;
  const deltaY = e.touches[0].clientY - lastMouseY;

  handleCameraRotation(deltaX, deltaY);

  lastMouseX = e.touches[0].clientX;
  lastMouseY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  isDragging = false;
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  isDragging = false;
}, { passive: false });

export const controls = {

};

export function onCleanup() {
  root.destroy();
}

// #endregion
