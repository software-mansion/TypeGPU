import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import {
  Particle,
  PosVel,
  SPHParams,
  computeCopyPosition,
  copyPositionLayout,
} from './alg/copyPosition';
import {
  Environment,
  computeDensity,
  densityLayout,
} from './alg/density';
import { computeForce, forceLayout } from './alg/force';
import { RealBoxSize, computeIntegrate, integrateLayout } from './alg/integrate';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

const dpr = window.devicePixelRatio || 1;
function resizeCanvas() {
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
}
resizeCanvas();

// Camera setup
const Camera = d.struct({ viewProj: d.mat4x4f, position: d.vec3f });
const cameraBuffer = root.createBuffer(Camera, {
  viewProj: d.mat4x4f.identity(),
  position: d.vec3f(),
}).$usage('uniform');

const cameraUp = d.vec3f(0, 1, 0);
const fov = (60 * Math.PI) / 180;
const near = 0.1;
const far = 500.0;
const viewport = () => ({ w: canvas.width, h: canvas.height, aspect: canvas.width / canvas.height });

const boxHalf = d.vec3f(15, 10, 15);
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 3;
let cameraDistance = Math.max(boxHalf.x, boxHalf.y, boxHalf.z) * 4;
const updateCamera = () => {
  const { aspect } = viewport();
  const target = d.vec3f(0, 0, 0);
  const pos = target.add(d.vec3f(
    cameraDistance * Math.sin(cameraPhi) * Math.cos(cameraTheta),
    cameraDistance * Math.cos(cameraPhi),
    cameraDistance * Math.sin(cameraPhi) * Math.sin(cameraTheta),
  ));
  const view = m.mat4.lookAt(pos, target, cameraUp, d.mat4x4f());
  const proj = m.mat4.perspective(fov, aspect, near, far, d.mat4x4f());
  const viewProj = m.mat4.mul(proj, view, d.mat4x4f());
  cameraBuffer.write({ viewProj, position: pos });
};
updateCamera();

window.addEventListener('resize', () => { resizeCanvas(); updateCamera(); });

const N = 3000; // keep under 3000 bo sie zesra
const dt = 0.004;
const kernelRadius = 1.2;
const mass = 1.0;
const restDensity = 1.0;
const stiffness = 200.0;
const nearStiffness = 200.0;
const viscosity = 0.1;

const params = root.createUniform(SPHParams, {
  mass,
  kernelRadius,
  kernelRadiusPow2: kernelRadius * kernelRadius,
  kernelRadiusPow5: kernelRadius ** 5,
  kernelRadiusPow6: kernelRadius ** 6,
  kernelRadiusPow9: kernelRadius ** 9,
  dt,
  stiffness,
  nearStiffness,
  restDensity,
  viscosity,
  n: d.u32(N),
});

// 1x1x1 grid that contains all particles
const env = root.createUniform(Environment, {
  xGrids: 1,
  yGrids: 1,
  zGrids: 1,
  cellSize: Math.max(2 * boxHalf.x, 2 * boxHalf.y, 2 * boxHalf.z) + 1.0,
  xHalf: boxHalf.x,
  yHalf: boxHalf.y,
  zHalf: boxHalf.z,
  offset: -1e-3,
});

const realBox = root.createUniform(RealBoxSize, { xHalf: boxHalf.x, yHalf: boxHalf.y, zHalf: boxHalf.z });

const prefixSum = root.createBuffer(d.arrayOf(d.u32, 2), [0, N]).$usage('storage');

const initialParticles = Array.from({ length: N }, (_, i) => {
  const u = i / N;
  // pack initial block of fluid
  const px = (Math.random() * 0.6 - 0.3) * boxHalf.x * 1.5;
  const py = Math.random() * boxHalf.y * 0.5 + boxHalf.y * 0.25;
  const pz = (Math.random() * 0.6 - 0.3) * boxHalf.z * 1.5;
  return Particle({
    position: d.vec3f(px, py, pz),
    v: d.vec3f(0, 0, 0),
    force: d.vec3f(0, 0, 0),
    density: 0,
    nearDensity: 0,
  });
});

const particles = root.createBuffer(d.arrayOf(Particle, N), initialParticles).$usage('storage');

const posvel = root.createBuffer(d.arrayOf(PosVel, N)).$usage('storage');

const densityBindGroup = root.createBindGroup(densityLayout, {
  particles,
  prefixSum,
  env: env.buffer,
  params: params.buffer,
});

const forceBindGroup = root.createBindGroup(forceLayout, {
  particles,
  prefixSum,
  env: env.buffer,
  params: params.buffer,
});

const integrateBindGroup = root.createBindGroup(integrateLayout, {
  particles,
  realBox: realBox.buffer,
  params: params.buffer,
});

const copyPositionBindGroup = root.createBindGroup(copyPositionLayout, {
  particles,
  posvel,
  params: params.buffer,
});

const densityPipeline = root['~unstable']
  .withCompute(computeDensity)
  .createPipeline()
  .with(densityLayout, densityBindGroup);

const forcePipeline = root['~unstable']
  .withCompute(computeForce)
  .createPipeline()
  .with(forceLayout, forceBindGroup);

const integratePipeline = root['~unstable']
  .withCompute(computeIntegrate)
  .createPipeline()
  .with(integrateLayout, integrateBindGroup);

const copyPosPipeline = root['~unstable']
  .withCompute(computeCopyPosition)
  .createPipeline()
  .with(copyPositionLayout, copyPositionBindGroup);

const particleLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  posvel: { storage: d.arrayOf(PosVel, N), access: 'readonly' },
});

const pointVert = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, color: d.vec3f },
})((input) => {
  const p = particleLayout.$.posvel[input.vertexIndex].position;
  const clip = std.mul(particleLayout.$.camera.viewProj, d.vec4f(p, 1));
  return { pos: clip, color: d.vec3f(0.2, 0.6, 1.0) };
});

const pointFrag = tgpu['~unstable'].fragmentFn({ in: { color: d.vec3f }, out: d.vec4f })((input) => {
  return d.vec4f(input.color, 1);
});

const renderPipeline = root['~unstable']
  .withVertex(pointVert, {})
  .withFragment(pointFrag, { format: presentationFormat })
  .withPrimitive({ topology: 'point-list' })
  .createPipeline();

const particleBindGroup = root.createBindGroup(particleLayout, { camera: cameraBuffer, posvel });

// orbit controls
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
const handleCameraRotation = (dx: number, dy: number) => {
  cameraTheta -= dx * 0.01;
  cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + dy * 0.01));
  updateCamera();
};
canvas.addEventListener('mousedown', (e) => { isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; });
canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  handleCameraRotation(e.clientX - lastMouseX, e.clientY - lastMouseY);
  lastMouseX = e.clientX; lastMouseY = e.clientY;
});
canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cameraDistance *= 1 + e.deltaY * 0.001; updateCamera(); }, { passive: false });

// Frame loop: density -> force -> integrate -> copy positions -> render
let running = true;
function frame() {
  if (!running) return;

  // step simulation
  const groups = Math.ceil(N / 64);
  densityPipeline.dispatchWorkgroups(groups);
  forcePipeline.dispatchWorkgroups(groups);
  integratePipeline.dispatchWorkgroups(groups);
  copyPosPipeline.dispatchWorkgroups(groups);

  // render
  renderPipeline.withColorAttachment({
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
    clearValue: [0.03, 0.03, 0.04, 1],
  })
  .with(particleLayout, particleBindGroup)
  .draw(N);

  root['~unstable'].flush();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export const controls = {};
export function onCleanup() {
  running = false;
  root.destroy();
}

// #endregion
