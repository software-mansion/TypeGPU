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
const state = new State(INIT_CONFIG, world);
await state.init(root);

const cameraUniform = root.createUniform(Camera);

const {
  getMovementInput,
  getYaw,
  updateCamera,
  cleanup: cleanupCamera,
} = setupThirdPersonCamera(canvas);

const mesher = new Mesher(root);
const time = performance.now();
mesher.recalculateMeshesFor(state.map.chunks);
const total = performance.now() - time;
console.log(
  `Meshing ${state.map.chunks.length} chunks took ${total.toFixed(0)}ms, agv: ${(total / state.map.chunks.length).toFixed(2)}ms`,
);

const renderer = new Renderer(root, cameraUniform, state.player.dims);

let frameId = requestAnimationFrame(draw);
function draw() {
  const input = getMovementInput();
  const yaw = getYaw();
  state.step(input, yaw);

  const playerPos = state.player.position;
  const camera = updateCamera(playerPos);
  cameraUniform.write(camera);

  const mesherResources = mesher.getResources();
  renderer.render(context, mesherResources, playerPos);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  root.destroy();
}
