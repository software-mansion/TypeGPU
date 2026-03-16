import tgpu from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';

import { Camera } from './schemas.ts';
import { State } from './state.ts';
import { INIT_CONFIG } from './params.ts';
import { Mesher } from './mesher.ts';
import { Renderer } from './renderer.ts';
import { setupThirdPersonCamera } from './thirdPersonCamera.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

await RAPIER.init();
const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
const state = new State(root, INIT_CONFIG, world);
await state.init();

const cameraUniform = root.createUniform(Camera);

const {
  getMovementInput,
  getYaw,
  updateCamera,
  cleanup: cleanupCamera,
} = setupThirdPersonCamera(canvas);

const mesher = new Mesher(root);

const renderer = new Renderer(root, cameraUniform, state.player.dims);

let frameId = requestAnimationFrame(draw);
function draw() {
  const input = getMovementInput();
  const yaw = getYaw();
  state.step(input, yaw);

  const playerPos = state.player.position;
  const camera = updateCamera(playerPos);
  cameraUniform.write(camera);

  // for testing purposes, let's modify one block chunk 0, 0, 0
  // const randomBlockPos = d.vec3i(
  //   Math.floor(Math.random() * 16),
  //   Math.floor(Math.random() * 16),
  //   Math.floor(Math.random() * 16),
  // );
  // state.worldMap.updateBlock(d.vec3i(), randomBlockPos, Math.random() < 0.5 ? 0 : 1);

  mesher.updateMeshes(state.worldMap);

  const mesherResources = mesher.getResources();
  renderer.render(context, mesherResources, playerPos);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  root.destroy();
}
