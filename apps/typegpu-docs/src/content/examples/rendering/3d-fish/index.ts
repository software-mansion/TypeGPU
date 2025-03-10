import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu, { type TgpuRoot } from 'typegpu';
import { distance, distanceVectorFromLine } from './tgsl-helpers';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';
import * as p from './params';
import {
  Camera,
  computeBindGroupLayout,
  ModelDataArray,
  modelVertexLayout,
  MouseRay,
  renderBindGroupLayout,
  renderInstanceLayout,
} from './schemas';
import { fragmentShader, vertexShader } from './render';

// TODO: remove wrapping sides
// TODO: split into files
// TODO: add vector spread where possible
// TODO: make fishes frame independent
// TODO: canvas on entire screen

// compute shader

const {
  currentFishData: computeCurrentFishData,
  nextFishData: computeNextFishData,
  mouseRay: computeMouseRay,
} = computeBindGroupLayout.bound;

const mainCompute = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [p.workGroupSize],
  })
  .does((input) => {
    const fishIndex = input.gid.x;
    const fishData = computeCurrentFishData.value[fishIndex];
    let separation = d.vec3f();
    let alignment = d.vec3f();
    let alignmentCount = 0;
    let cohesion = d.vec3f();
    let cohesionCount = 0;
    let wallRepulsion = d.vec3f();
    let rayRepulsion = d.vec3f();

    for (let i = 0; i < p.fishAmount; i += 1) {
      if (d.u32(i) === fishIndex) {
        continue;
      }

      const other = computeCurrentFishData.value[i];
      const dist = distance(fishData.position, other.position);
      if (dist < p.fishSeparationDistance) {
        separation = std.add(
          separation,
          std.sub(fishData.position, other.position),
        );
      }
      if (dist < p.fishAlignmentDistance) {
        alignment = std.add(alignment, other.direction);
        alignmentCount = alignmentCount + 1;
      }
      if (dist < p.fishCohesionDistance) {
        cohesion = std.add(cohesion, other.position);
        cohesionCount = cohesionCount + 1;
      }
    }
    if (alignmentCount > 0) {
      alignment = std.mul(1 / d.f32(alignmentCount), alignment);
    }
    if (cohesionCount > 0) {
      cohesion = std.sub(
        std.mul(1 / d.f32(cohesionCount), cohesion),
        fishData.position,
      );
    }
    for (let i = 0; i < 3; i += 1) {
      if (p.wrappingSides[i] === 1) {
        continue;
      }

      const repulsion = d.vec3f();
      repulsion[i] = 1.0;

      const axisAquariumSize = p.aquariumSize[i] / 2;
      const axisPosition = fishData.position[i];
      const distance = p.fishWallRepulsionDistance;

      if (axisPosition > axisAquariumSize - distance) {
        const str = axisPosition - (axisAquariumSize - distance);
        wallRepulsion = std.sub(wallRepulsion, std.mul(str, repulsion));
      }

      if (axisPosition < -axisAquariumSize + distance) {
        const str = -axisAquariumSize + distance - axisPosition;
        wallRepulsion = std.add(wallRepulsion, std.mul(str, repulsion));
      }
    }

    if (computeMouseRay.value.activated === 1) {
      const distanceVector = distanceVectorFromLine(
        computeMouseRay.value.pointX,
        computeMouseRay.value.pointY,
        fishData.position,
      );
      const limit = p.fishMouseRayRepulsionDistance;
      const str =
        std.pow(2, std.clamp(limit - std.length(distanceVector), 0, limit)) - 1;
      rayRepulsion = std.mul(str, std.normalize(distanceVector));
    }

    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishSeparationStrength, separation),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishAlignmentStrength, alignment),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishCohesionStrength, cohesion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishWallRepulsionStrength, wallRepulsion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishMouseRayRepulsionStrength, rayRepulsion),
    );

    fishData.direction = std.mul(
      std.clamp(std.length(fishData.direction), 0.0, 0.01),
      std.normalize(fishData.direction),
    );

    fishData.position = std.add(fishData.position, fishData.direction);
    for (let i = 0; i < 3; i += 1) {
      if (p.wrappingSides[i] === 0) {
        continue;
      }
      if (fishData.position[i] - p.fishModelScale > p.aquariumSize[i] / 2) {
        fishData.position[i] = -p.aquariumSize[i] / 2;
      } else if (
        fishData.position[i] + p.fishModelScale <
        -p.aquariumSize[i] / 2
      ) {
        fishData.position[i] = p.aquariumSize[i] / 2;
      }
    }

    computeNextFishData.value[fishIndex] = fishData;
  });

// setup

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// buffers

const camera = {
  position: p.cameraInitialPosition,
  c_target: p.cameraInitialTarget,
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

const fishDataBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(ModelDataArray(p.fishAmount))
    .$usage('storage', 'uniform', 'vertex'),
);

const mouseRayBuffer = root.createBuffer(MouseRay).$usage('uniform');

const randomizeFishPositions = () => {
  const positions = Array.from({ length: p.fishAmount }, () => ({
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
    seaFog: 1,
    seaBlindness: 1,
  }));
  fishDataBuffers[0].write(positions);
  fishDataBuffers[1].write(positions);
};
randomizeFishPositions();

// models and textures

async function loadModel(
  root: TgpuRoot,
  modelPath: string,
  texturePath: string,
) {
  const modelMesh = await load(modelPath, OBJLoader);
  const polygonCount = modelMesh.attributes.POSITION.value.length / 3;

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(polygonCount))
    .$usage('vertex')
    .$name('vertex');

  const modelVertices = [];
  for (let i = 0; i < polygonCount; i++) {
    modelVertices.push({
      modelPosition: d.vec3f(
        modelMesh.attributes.POSITION.value[3 * i],
        modelMesh.attributes.POSITION.value[3 * i + 1],
        modelMesh.attributes.POSITION.value[3 * i + 2],
      ),
      modelNormal: d.vec3f(
        modelMesh.attributes.NORMAL.value[3 * i],
        modelMesh.attributes.NORMAL.value[3 * i + 1],
        modelMesh.attributes.NORMAL.value[3 * i + 2],
      ),
      textureUV: d.vec2f(
        modelMesh.attributes.TEXCOORD_0.value[2 * i],
        1 - modelMesh.attributes.TEXCOORD_0.value[2 * i + 1],
      ),
      instanceIndex: 0,
    });
  }
  modelVertices.reverse();

  vertexBuffer.write(modelVertices);

  const textureResponse = await fetch(texturePath);
  const imageBitmap = await createImageBitmap(await textureResponse.blob());
  const texture = root['~unstable']
    .createTexture({
      size: [imageBitmap.width, imageBitmap.height],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  root.device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: root.unwrap(texture) },
    [imageBitmap.width, imageBitmap.height],
  );

  return {
    vertexBuffer: vertexBuffer,
    polygonCount: polygonCount,
    texture: texture,
  };
}

// https://free3d.com/3d-model/fish---low-poly-82864.html
const fishModel = await loadModel(
  root,
  'assets/3d-fish/fish.obj',
  'assets/3d-fish/fish.png',
);

// https://www.cgtrader.com/free-3d-models/space/other/rainy-ocean
// https://www.istockphoto.com/pl/obrazy/sand
const oceanFloorModel = await loadModel(
  root,
  'assets/3d-fish/ocean_floor.obj',
  'assets/3d-fish/ocean_floor.jpg',
);

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
  .withCompute(mainCompute)
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
  }),
);

const oceanFloorDataBuffer = root
  .createBuffer(ModelDataArray(1), [
    {
      position: d.vec3f(0, -p.aquariumSize.y / 2 - 1, 0),
      direction: d.vec3f(1, 0, 0),
      scale: 1,
      seaFog: 1,
      seaBlindness: 0,
    },
  ])
  .$usage('storage', 'vertex', 'uniform');

const renderOceanFloorBindGroups = root.createBindGroup(renderBindGroupLayout, {
  modelData: oceanFloorDataBuffer,
  camera: cameraBuffer,
  modelTexture: oceanFloorModel.texture,
  sampler: sampler,
});

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
    currentFishData: fishDataBuffers[idx],
    nextFishData: fishDataBuffers[1 - idx],
    mouseRay: mouseRayBuffer,
  }),
);

// frame

let odd = false;
let disposed = false;
let mouseRay = MouseRay({
  activated: 0,
  pointX: d.vec3f(),
  pointY: d.vec3f(),
});

function frame() {
  if (disposed) {
    return;
  }

  cameraBuffer.write(camera);
  mouseRayBuffer.write(mouseRay);

  odd = !odd;
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
    .with(renderBindGroupLayout, renderOceanFloorBindGroups)
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
frame();

// #region Example controls and cleanup

export const controls = {
  'Randomize positions': {
    onButtonClick: () => randomizeFishPositions(),
  },
};

// Variables for mouse interaction.
let isLeftPressed = false;
let previousMouseX = 0;
let previousMouseY = 0;
let isRightPressed = false;

const cameraRadius = distance(
  p.cameraInitialPosition.xyz,
  p.cameraInitialTarget.xyz,
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

  camera.c_target = d.vec4f(newCamX, newCamY, newCamZ, 1);
  camera.view = m.mat4.lookAt(
    p.cameraInitialPosition,
    camera.c_target,
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

  mouseRay = {
    activated: 1,
    pointX: camera.position.xyz,
    pointY: worldPosNonUniform,
  };
}

// Prevent the context menu from appearing on right click.
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

canvas.addEventListener('mousedown', async (event) => {
  previousMouseX = event.clientX;
  previousMouseY = event.clientY;
  if (event.button === 0) {
    const helpInfo = document.getElementById('help') as HTMLDivElement;
    helpInfo.style.opacity = '0';
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
    mouseRay = {
      activated: 0,
      pointX: d.vec3f(),
      pointY: d.vec3f(),
    };
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

const resizeObserver = new ResizeObserver(() => {
  depthTexture.destroy();
  depthTexture = root.device.createTexture({
    size: [context.canvas.width, context.canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
});
resizeObserver.observe(canvas);

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
