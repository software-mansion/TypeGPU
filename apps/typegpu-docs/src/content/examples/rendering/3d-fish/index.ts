import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import { computeShader } from './compute.ts';
import { loadModel } from './load-model.ts';
import * as p from './params.ts';
import { fragmentShader, vertexShader } from './render.ts';
import {
  Camera,
  computeBindGroupLayout,
  FishBehaviorParams,
  Line3,
  type ModelData,
  ModelDataArray,
  modelVertexLayout,
  MouseRay,
  renderBindGroupLayout,
  renderInstanceLayout,
} from './schemas.ts';

// setup
let speedMultiplier = 1;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// models and textures

const presets = {
  default: {
    separationDist: 0.3,
    separationStr: 0.0006,
    alignmentDist: 0.3,
    alignmentStr: 0.005,
    cohesionDist: 0.5,
    cohesionStr: 0.0004,
  },
  init: {
    separationDist: 0.2,
    separationStr: 0.1,
    alignmentDist: 0.5,
    alignmentStr: 1,
    cohesionDist: 0.3,
    cohesionStr: 0.013,
  },
} as const;

const spinnerBackground = document.querySelector(
  '.spinner-background',
) as HTMLDivElement;

// https://sketchfab.com/3d-models/animated-low-poly-fish-64adc2e5a4be471e8279532b9610c878
const fishModel = await loadModel(
  root,
  '/TypeGPU/assets/3d-fish/fish.obj',
  '/TypeGPU/assets/3d-fish/fish.jpg',
);

// https://www.cgtrader.com/free-3d-models/space/other/rainy-ocean
// https://www.rawpixel.com/image/6032317/white-sand-texture-free-public-domain-cc0-photo
const oceanFloorModel = await loadModel(
  root,
  '/TypeGPU/assets/3d-fish/ocean_floor.obj',
  '/TypeGPU/assets/3d-fish/ocean_floor.png',
);

// buffers

const fishDataBuffers = Array.from({ length: 2 }, (_, idx) =>
  root
    .createBuffer(ModelDataArray(p.fishAmount))
    .$usage('storage', 'vertex')
    .$name(`fish data ${idx}`));

function enqueuePresetChanges() {
  speedMultiplier = 3;
  spinnerBackground.style.display = 'grid';
  fishBehaviorBuffer.write(presets.init);

  setTimeout(() => {
    if (disposed) return;
    fishBehaviorBuffer.write(presets.default);
    spinnerBackground.style.display = 'none';
    speedMultiplier = 1;
  }, 300);
}

const randomizeFishPositions = () => {
  const positions: d.Infer<typeof ModelData>[] = Array.from(
    { length: p.fishAmount },
    () => ({
      position: d.vec3f(
        Math.random() * p.aquariumSize.x - p.aquariumSize.x / 2,
        Math.random() * p.aquariumSize.y - p.aquariumSize.y / 2,
        Math.random() * p.aquariumSize.z - p.aquariumSize.z / 2,
      ),
      direction: d.vec3f(
        Math.random() * 0.1 - 0.05,
        Math.random() * 0.1 - 0.05,
        Math.random() * 0.1 - 0.05,
      ),
      scale: p.fishModelScale * (1 + (Math.random() - 0.5) * 0.8),
      variant: Math.random(),
      applySinWave: 1,
      applySeaFog: 1,
      applySeaDesaturation: 1,
    }),
  );
  fishDataBuffers[0].write(positions);
  fishDataBuffers[1].write(positions);
  enqueuePresetChanges();
};

const camera = {
  position: p.cameraInitialPosition,
  targetPos: p.cameraInitialTarget,
  view: m.mat4.lookAt(
    p.cameraInitialPosition,
    p.cameraInitialTarget,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  ),
  projection: m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  ),
};

const cameraBuffer = root.createBuffer(Camera, camera).$usage('uniform');

const mouseRayBuffer = root
  .createBuffer(MouseRay, {
    activated: 0,
    line: Line3({ origin: d.vec3f(), dir: d.vec3f() }),
  })
  .$usage('uniform');

const timePassedBuffer = root.createBuffer(d.f32).$usage('uniform');

const currentTimeBuffer = root.createBuffer(d.f32).$usage('uniform');

const fishBehaviorBuffer = root
  .createBuffer(FishBehaviorParams, presets.default)
  .$usage('uniform');

const oceanFloorDataBuffer = root
  .createBuffer(ModelDataArray(1), [
    {
      position: d.vec3f(0, -p.aquariumSize.y / 2 - 1, 0),
      direction: d.vec3f(1, 0, 0),
      scale: 1,
      variant: 0,
      applySinWave: 0,
      applySeaFog: 1,
      applySeaDesaturation: 0,
    },
  ])
  .$usage('storage', 'vertex');

randomizeFishPositions();

// pipelines

const renderPipeline = root['~unstable']
  .withVertex(vertexShader, modelVertexLayout.attrib)
  .withFragment(fragmentShader, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withPrimitive({ topology: 'triangle-list' })
  .createPipeline();

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline();

// bind groups

const sampler = root.device.createSampler({
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  magFilter: 'linear',
  minFilter: 'linear',
});

const renderFishBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(renderBindGroupLayout, {
    modelData: fishDataBuffers[idx],
    camera: cameraBuffer,
    modelTexture: fishModel.texture,
    sampler: sampler,
    currentTime: currentTimeBuffer,
  })
);

const renderOceanFloorBindGroup = root.createBindGroup(renderBindGroupLayout, {
  modelData: oceanFloorDataBuffer,
  camera: cameraBuffer,
  modelTexture: oceanFloorModel.texture,
  sampler: sampler,
  currentTime: currentTimeBuffer,
});

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
    currentFishData: fishDataBuffers[idx],
    nextFishData: fishDataBuffers[1 - idx],
    mouseRay: mouseRayBuffer,
    timePassed: timePassedBuffer,
    fishBehavior: fishBehaviorBuffer,
  })
);

// frame

let odd = false;
let lastTimestamp: DOMHighResTimeStamp = 0;
let disposed = false;

function frame(timestamp: DOMHighResTimeStamp) {
  if (disposed) {
    return;
  }
  odd = !odd;

  currentTimeBuffer.write(timestamp);
  timePassedBuffer.write((timestamp - lastTimestamp) * speedMultiplier);
  lastTimestamp = timestamp;
  cameraBuffer.write(camera);

  computePipeline
    .with(computeBindGroupLayout, computeBindGroups[odd ? 1 : 0])
    .dispatchWorkgroups(p.fishAmount / p.workGroupSize);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [
        p.backgroundColor.x,
        p.backgroundColor.y,
        p.backgroundColor.z,
        1,
      ],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, oceanFloorModel.vertexBuffer)
    .with(renderInstanceLayout, oceanFloorDataBuffer)
    .with(renderBindGroupLayout, renderOceanFloorBindGroup)
    .draw(oceanFloorModel.polygonCount, 1);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [
        p.backgroundColor.x,
        p.backgroundColor.y,
        p.backgroundColor.z,
        1,
      ],
      loadOp: 'load' as const,
      storeOp: 'store' as const,
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, fishModel.vertexBuffer)
    .with(renderInstanceLayout, fishDataBuffers[odd ? 1 : 0])
    .with(renderBindGroupLayout, renderFishBindGroups[odd ? 1 : 0])
    .draw(fishModel.polygonCount, p.fishAmount);

  root['~unstable'].flush();

  requestAnimationFrame(frame);
}
enqueuePresetChanges();
requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = {
  'Randomize positions': {
    onButtonClick: () => randomizeFishPositions(),
  },
};

// Variables for interaction

let isLeftPressed = false;
let previousMouseX = 0;
let previousMouseY = 0;
let isRightPressed = false;

let isPopupDiscarded = false;
const controlsPopup = document.getElementById('help') as HTMLDivElement;

const cameraRadius = std.length(
  std.sub(p.cameraInitialPosition.xyz, p.cameraInitialTarget.xyz),
);
let cameraYaw =
  (Math.atan2(p.cameraInitialPosition.x, p.cameraInitialPosition.z) + Math.PI) %
  Math.PI;
let cameraPitch = Math.asin(p.cameraInitialPosition.y / cameraRadius);

function updateCameraTarget(cx: number, cy: number) {
  // make it so the drag does the same movement regardless of size
  const box = canvas.getBoundingClientRect();
  const dx = cx / box.width;
  const dy = cy / box.height;

  cameraYaw += dx * 2.5;
  cameraPitch += dy * 2.5;

  cameraYaw = std.clamp(cameraYaw, (Math.PI / 4) * -0.2, (Math.PI / 4) * 2.2);
  cameraPitch = std.clamp(cameraPitch, -Math.PI / 4, Math.PI / 4);

  const newCamX = cameraRadius * Math.sin(cameraYaw) * Math.cos(cameraPitch);
  const newCamY = cameraRadius * Math.sin(cameraPitch);
  const newCamZ = cameraRadius * Math.cos(cameraYaw) * Math.cos(cameraPitch);

  camera.targetPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  camera.view = m.mat4.lookAt(
    p.cameraInitialPosition,
    camera.targetPos,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
}

async function updateMouseRay(cx: number, cy: number) {
  const boundingBox = canvas.getBoundingClientRect();
  const canvasX = Math.floor((cx - boundingBox.left) * window.devicePixelRatio);
  const canvasY = Math.floor((cy - boundingBox.top) * window.devicePixelRatio);
  const canvasPoint = d.vec4f(
    (canvasX / canvas.width) * 2 - 1,
    (1 - canvasY / canvas.height) * 2 - 1,
    0,
    1,
  );

  const invView = m.mat4.inverse(camera.view, d.mat4x4f());
  const invProj = m.mat4.inverse(camera.projection, d.mat4x4f());
  const intermediate = std.mul(invProj, canvasPoint);
  const worldPos = std.mul(invView, intermediate);
  const worldPosNonUniform = d.vec3f(
    worldPos.x / worldPos.w,
    worldPos.y / worldPos.w,
    worldPos.z / worldPos.w,
  );

  mouseRayBuffer.write({
    activated: 1,
    line: Line3({
      origin: camera.position.xyz,
      dir: std.normalize(
        std.sub(worldPosNonUniform, camera.position.xyz),
      ),
    }),
  });
}

// Prevent the context menu from appearing on right click.
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

// Mouse controls

canvas.addEventListener('mousedown', async (event) => {
  previousMouseX = event.clientX;
  previousMouseY = event.clientY;
  controlsPopup.style.opacity = '0';
  isPopupDiscarded = true;

  if (event.button === 0) {
    isLeftPressed = true;
  }
  if (event.button === 2) {
    isRightPressed = true;
    updateMouseRay(event.clientX, event.clientY);
  }
});

window.addEventListener('mouseup', (event) => {
  if (event.button === 0) {
    isLeftPressed = false;
  }
  if (event.button === 2) {
    isRightPressed = false;
    mouseRayBuffer.writePartial({
      activated: 0,
    });
  }
});

canvas.addEventListener('mousemove', () => {
  if (!isPopupDiscarded) {
    controlsPopup.style.opacity = '1';
  }
});

window.addEventListener('mousemove', (event) => {
  const dx = event.clientX - previousMouseX;
  const dy = event.clientY - previousMouseY;
  previousMouseX = event.clientX;
  previousMouseY = event.clientY;

  if (isLeftPressed) {
    updateCameraTarget(dx, dy);
  }

  if (isRightPressed) {
    updateMouseRay(event.clientX, event.clientY);
  }
});

// Touch controls

canvas.addEventListener('touchstart', async (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    previousMouseX = event.touches[0].clientX;
    previousMouseY = event.touches[0].clientY;
    updateMouseRay(event.touches[0].clientX, event.touches[0].clientY);
    controlsPopup.style.opacity = '0';
  }
});

window.addEventListener('touchmove', (event) => {
  if (event.touches.length === 1) {
    const dx = event.touches[0].clientX - previousMouseX;
    const dy = event.touches[0].clientY - previousMouseY;
    previousMouseX = event.touches[0].clientX;
    previousMouseY = event.touches[0].clientY;

    updateCameraTarget(dx, dy);
    updateMouseRay(event.touches[0].clientX, event.touches[0].clientY);
  }
});

window.addEventListener('touchend', () => {
  mouseRayBuffer.writePartial({
    activated: 0,
  });
});

// observer and cleanup

const resizeObserver = new ResizeObserver(() => {
  camera.projection = m.mat4.perspective(
    Math.PI / 4,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1000,
    d.mat4x4f(),
  );

  depthTexture.destroy();
  depthTexture = root.device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
});
resizeObserver.observe(canvas);

export function onCleanup() {
  disposed = true;
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
