import tgpu, { d } from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';

import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';
import { State } from './state.ts';
import { INIT_CONFIG } from './params.ts';
import { Mesher } from './mesher.ts';
import { Renderer } from './renderer.ts';
import { coordToIndex } from './chunkGenerator.ts';

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
mesher.recalculateMeshesFor(state.map.chunks);
const renderer = new Renderer(root, cameraUniform);

let frameId = requestAnimationFrame(draw);
function draw() {
  updatePosition();

  // for testing purposes, let's modify one block from a random chunk each frame
  // const randomChunk = state.map.chunks[Math.floor(Math.random() * state.map.chunks.length)];
  // const randomBlock = Math.floor(Math.random() * 16 ** 3);
  // randomChunk.blocks[randomBlock] = 1 - randomChunk.blocks[randomBlock];
  // mesher.recalculateMeshesFor([randomChunk]);

  const mesherResources = mesher.getResources();
  renderer.render(context, mesherResources);

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  root.destroy();
}
