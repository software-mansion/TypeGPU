import tgpu, { d, std } from 'typegpu';
import RAPIER from '@dimforge/rapier3d-compat';

import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';
import { VoxelInstance, CubeVertex, MeshLayout } from './schemas.ts';
import { cubeVertices } from './cubeVertices.ts';
import { State } from './state.ts';
import { INIT_CONFIG } from './params.ts';
import { MAX_CHUNKS_AT_ONCE, Mesher } from './mesher.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

await RAPIER.init();
const world = new RAPIER.World(new RAPIER.Vector3(0, -9.81, 0));
const state = new State(INIT_CONFIG, world);
await state.init();

const mesher = new Mesher(root);
mesher.recalculateMeshesFor(state.map.chunks);

const cameraUniform = root.createUniform(Camera);
const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  { initPos: state.player.pos, speed: d.vec3f(0.01, 0.1, 1) },
  (camera) => {
    cameraUniform.writePartial(camera);
  },
);

function createDepthTexture() {
  return root['~unstable']
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth24plus' })
    .$usage('render');
}
let depthTexture = createDepthTexture();

const resizeObserver = new ResizeObserver(() => {
  depthTexture = createDepthTexture();
});
resizeObserver.observe(canvas);

const pipeline = root.createRenderPipeline({
  attribs: { position: MeshLayout.attrib },
  vertex: (input) => {
    'use gpu';
    const worldPos = input.position;
    return {
      $position: cameraUniform.$.projection * cameraUniform.$.view * worldPos,
      worldPos,
    };
  },
  fragment: ({ worldPos }) => {
    'use gpu';
    const localPos = std.fract(worldPos.xyz);
    const nearEdge = std.min(localPos, 1 - localPos);
    const highest = std.max(nearEdge.x, nearEdge.y, nearEdge.z);
    const secondHighest = nearEdge.x + nearEdge.y + nearEdge.z - highest;
    const distFromEdge = std.min(highest, secondHighest);
    const color = std.select(d.vec3f(0.5), d.vec3f(0.3), distFromEdge < 0.05);
    return d.vec4f(color, 1);
  },
  depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  primitive: { cullMode: 'back' },
});

let frameId = requestAnimationFrame(draw);

function draw() {
  updatePosition();

  const mesherResources = mesher.getResources();

  // TODO: move this to a renderer
  const passDescriptor = {
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [1, 0.85, 0.74, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: root.unwrap(depthTexture).createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  } as const;

  const renderBundle = root['~unstable'].beginRenderBundleEncoder(
    {
      colorFormats: [presentationFormat],
      depthStencilFormat: 'depth24plus',
    },
    (pass) => {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(MeshLayout, mesherResources.vertexBuffer);

      for (let i = 0; i < MAX_CHUNKS_AT_ONCE; i++) {
        pass.drawIndirect(root.unwrap(mesherResources.indirectBuffer), 16 * i);
      }
    },
  );

  root['~unstable'].beginRenderPass(passDescriptor, (pass) => {
    pass.executeBundles([renderBundle]);
  });

  frameId = requestAnimationFrame(draw);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.disconnect();
  root.destroy();
}
