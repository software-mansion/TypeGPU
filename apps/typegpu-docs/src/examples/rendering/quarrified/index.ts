import tgpu, { d } from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';

import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';
import { State } from './state.ts';
import { INIT_CONFIG } from './params.ts';
import { Mesher } from './mesher.ts';
import { Renderer } from './renderer.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

await RAPIER.init();
const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
const state = new State(INIT_CONFIG, world);
await state.init(root);

const cameraUniform = root.createUniform(Camera);
const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  { initPos: state.player.pos, speed: d.vec3f(0.01, 0.1, 1) },
  (camera) => {
    cameraUniform.writePartial(camera);
  },
);

const mesher = new Mesher(root);

// --- This is here only to measure performance and will be removed ---
const time = performance.now();
const initialDirtyChunks = state.worldMap.getAndCleanModifiedChunks();
mesher.recalculateMeshesFor(initialDirtyChunks);
const total = performance.now() - time;
console.log(
  `Meshing ${initialDirtyChunks.length} chunks took ${total.toFixed(0)}ms, agv: ${(total / initialDirtyChunks.length).toFixed(2)}ms`,
);
// --- End ---

const renderer = new Renderer(root, cameraUniform);

let frameId = requestAnimationFrame(draw);
function draw() {
  updatePosition();

  // for testing purposes, let's modify one block chunk 0, 0, 0
  const randomBlockPos = d.vec3i(
    Math.floor(Math.random() * 16),
    Math.floor(Math.random() * 16),
    Math.floor(Math.random() * 16),
  );
  state.worldMap.updateBlock(d.vec3i(), randomBlockPos, Math.random() < 0.5 ? 0 : 1);

  mesher.recalculateMeshesFor(state.worldMap.getAndCleanModifiedChunks());

  const mesherResources = mesher.getResources();
  renderer.render(context, mesherResources);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  root.destroy();
}
