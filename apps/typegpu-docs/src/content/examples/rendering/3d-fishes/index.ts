import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

// data schemas

const FishParameters = d.struct({
  separationDistance: d.f32,
  separationStrength: d.f32,
  alignmentDistance: d.f32,
  alignmentStrength: d.f32,
  cohesionDistance: d.f32,
  cohesionStrength: d.f32,
  wallRepulsionDistance: d.f32,
  wallRepulsionStrength: d.f32,
  mouseRayRepulsionDistance: d.f32,
  mouseRayRepulsionStrength: d.f32,
});

const Camera = d.struct({
  position: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const ModelData = d.struct({
  position: d.vec3f,
  direction: d.vec3f, // in case of the fish, this is also the velocity
  scale: d.f32,
});

const ModelDataArray = (n: number) => d.arrayOf(ModelData, n);

const modelVertexInput = {
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
  textureUV: d.vec2f,
  instanceIndex: d.builtin.instanceIndex,
} as const;

const modelVertexOutput = {
  worldPosition: d.vec3f,
  worldNormal: d.vec3f,
  canvasPosition: d.builtin.position,
  textureUV: d.vec2f,
} as const;

const MouseRay = d.struct({
  activated: d.u32,
  pointX: d.vec3f,
  pointY: d.vec3f,
});

// constants

const workGroupSize = 256;

const fishAmount = 1024 * 8;
const fishModelScale = 0.015;

const aquariumSize = d.vec3f(8, 2, 8);
const wrappingSides = d.vec3u(0, 0, 0); // 1 for true, 0 for false

// TODO: remove the buffer and struct, just reference the constants
const fishParameters = FishParameters({
  separationDistance: 0.08,
  separationStrength: 0.001,
  alignmentDistance: 0.2,
  alignmentStrength: 0.02,
  cohesionDistance: 0.25,
  cohesionStrength: 0.0008,
  wallRepulsionDistance: 0.3,
  wallRepulsionStrength: 0.0003,
  mouseRayRepulsionDistance: 0.3,
  mouseRayRepulsionStrength: 0.005,
});

const cameraInitialPosition = d.vec4f(0.5, 1.5, 3.5, 1);
const cameraInitialTarget = d.vec3f(0, 0, 0);

const fogDistance = 1.5;
const fogThickness = 0.2;
const lightColor = d.vec3f(0.8, 0.8, 1);
const lightDirection = std.normalize(d.vec3f(1.0, 1.0, 1.0));
const backgroundColor = std.mul(0.6, d.vec3f(90 / 255, 170 / 255, 255 / 255));

// layouts

const modelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(modelVertexInput), n),
);

const renderInstanceLayout = tgpu.vertexLayout(ModelDataArray, 'instance');

const renderBindGroupLayout = tgpu.bindGroupLayout({
  modelData: { storage: ModelDataArray },
  modelTexture: { texture: 'float' },
  camera: { uniform: Camera },
  sampler: { sampler: 'filtering' },
});

const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentFishData: { storage: ModelDataArray },
  nextFishData: {
    storage: ModelDataArray,
    access: 'mutable',
  },
  fishParameters: { uniform: FishParameters },
  mouseRay: { uniform: MouseRay },
});

// render sharers

const {
  camera: renderCamera,
  modelTexture: renderModelTexture,
  sampler: renderSampler,
  modelData: renderModelData,
} = renderBindGroupLayout.bound;

const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: modelVertexInput,
    out: modelVertexOutput,
  })
  .does((input) => {
    // rotate the model so that it aligns with model's direction of movement
    // https://simple.wikipedia.org/wiki/Pitch,_yaw,_and_roll
    const modelData = renderModelData.value[input.instanceIndex];

    const modelPosition = input.modelPosition;

    const direction = std.normalize(modelData.direction);

    const yaw = std.atan2(direction.z, direction.x) + Math.PI;
    // biome-ignore format:
    const yawMatrix = d.mat3x3f(
          std.cos(yaw),  0, std.sin(yaw),
          0,             1, 0,           
          -std.sin(yaw), 0, std.cos(yaw),
        );

    const pitch = -std.asin(-direction.y);
    // biome-ignore format:
    const pitchMatrix = d.mat3x3f(
          std.cos(pitch), -std.sin(pitch), 0,
          std.sin(pitch), std.cos(pitch),  0,
          0,              0,               1,
        );

    const worldPosition = std.add(
      std.mul(
        yawMatrix,
        std.mul(pitchMatrix, std.mul(modelData.scale, modelPosition)),
      ),
      modelData.position,
    );

    // calculate where the normal vector points to
    const worldNormal = std.normalize(
      std.mul(pitchMatrix, std.mul(yawMatrix, input.modelNormal)),
    );

    // project the world position into the camera
    const worldPositionUniform = d.vec4f(
      worldPosition.x,
      worldPosition.y,
      worldPosition.z,
      1,
    );
    const canvasPosition = std.mul(
      renderCamera.value.projection,
      std.mul(renderCamera.value.view, worldPositionUniform),
    );

    return {
      canvasPosition: canvasPosition,
      textureUV: input.textureUV,
      worldNormal: worldNormal,
      worldPosition: worldPosition,
    };
  });

const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
      return textureSample(shaderTexture, shaderSampler, uv);
    }`)
  .$uses({ shaderTexture: renderModelTexture, shaderSampler: renderSampler })
  .$name('sampleShader');

const reflect = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f], d.vec3f)
  .does((i, n) => std.sub(i, std.mul(2.0, std.mul(std.dot(n, i), n))));

const distance = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f], d.f32)
  .does((v1, v2) => {
    const diff = std.sub(v1, v2);
    return std.pow(diff.x * diff.x + diff.y * diff.y + diff.z * diff.z, 0.5);
  });

const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: modelVertexOutput,
    out: d.location(0, d.vec4f),
  })
  .does((input) => {
    // shade the fragment in Phong reflection model
    // https://en.wikipedia.org/wiki/Phong_reflection_model

    const viewDirection = std.normalize(
      std.sub(renderCamera.value.position.xyz, input.worldPosition),
    );
    const textureColorWithAlpha = sampleTexture(input.textureUV); // base color
    const textureColor = textureColorWithAlpha.xyz;

    let ambient = d.vec3f();
    let diffuse = d.vec3f();
    let specular = d.vec3f();

    ambient = std.mul(0.5, std.mul(textureColor, lightColor));

    const cosTheta = std.max(0.0, std.dot(input.worldNormal, lightDirection));
    if (cosTheta > 0) {
      diffuse = std.mul(cosTheta, std.mul(textureColor, lightColor));

      const reflectionDirection = reflect(
        std.mul(-1, lightDirection),
        input.worldNormal,
      );

      specular = std.mul(
        0.5,
        std.mul(
          textureColor,
          std.mul(std.dot(reflectionDirection, viewDirection), lightColor),
        ),
      );
    }

    const fragmentColor = std.add(ambient, std.add(diffuse, specular));
    const distanceFromCamera = distance(
      renderCamera.value.position.xyz,
      input.worldPosition,
    );

    const fogParameter = std.max(
      0,
      (distanceFromCamera - fogDistance) * fogThickness,
    );
    const fogFactor = fogParameter / (1 + fogParameter);

    const foggedColor = d.vec4f(
      std.mix(fragmentColor.x, backgroundColor.x, fogFactor),
      std.mix(fragmentColor.y, backgroundColor.y, fogFactor),
      std.mix(fragmentColor.z, backgroundColor.z, fogFactor),
      d.f32(1),
    );
    return foggedColor;
  })
  .$name('mainFragment');

// compute shader

const distanceVectorFromLine = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f, d.vec3f], d.vec3f)
  .does((l1, l2, x) => {
    const d = std.normalize(std.sub(l2, l1));
    const v = std.sub(x, l1);
    const t = std.dot(v, d);
    const p = std.add(l1, std.mul(t, d));
    return std.sub(x, p);
  });

const {
  currentFishData: computeCurrentFishData,
  nextFishData: computeNextFishData,
  fishParameters: computeFishParameters,
  mouseRay: computeMouseRay,
} = computeBindGroupLayout.bound;

const mainCompute = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [workGroupSize],
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

    for (let i = 0; i < fishAmount; i += 1) {
      if (d.u32(i) === fishIndex) {
        continue;
      }

      const other = computeCurrentFishData.value[i];
      const dist = distance(fishData.position, other.position);
      if (dist < computeFishParameters.value.separationDistance) {
        separation = std.add(
          separation,
          std.sub(fishData.position, other.position),
        );
      }
      if (dist < computeFishParameters.value.alignmentDistance) {
        alignment = std.add(alignment, other.direction);
        alignmentCount = alignmentCount + 1;
      }
      if (dist < computeFishParameters.value.cohesionDistance) {
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
      if (wrappingSides[i] === 1) {
        continue;
      }

      const repulsion = d.vec3f();
      repulsion[i] = 1.0;

      const axisAquariumSize = aquariumSize[i] / 2;
      const axisPosition = fishData.position[i];
      const distance = computeFishParameters.value.wallRepulsionDistance;

      if (axisPosition > axisAquariumSize - distance) {
        const str = std.pow(2, axisPosition - (axisAquariumSize - distance));
        wallRepulsion = std.sub(wallRepulsion, std.mul(str, repulsion));
      }

      if (axisPosition < -axisAquariumSize + distance) {
        const str = std.pow(2, -(-axisAquariumSize + distance - axisPosition));
        wallRepulsion = std.add(wallRepulsion, std.mul(str, repulsion));
      }
    }

    if (computeMouseRay.value.activated === 1) {
      const distanceVector = distanceVectorFromLine(
        computeMouseRay.value.pointX,
        computeMouseRay.value.pointY,
        fishData.position,
      );
      const limit = computeFishParameters.value.mouseRayRepulsionDistance;
      const str =
        std.pow(2, std.clamp(limit - std.length(distanceVector), 0, limit)) - 1;
      rayRepulsion = std.mul(str, std.normalize(distanceVector));
    }

    fishData.direction = std.add(
      fishData.direction,
      std.mul(computeFishParameters.value.separationStrength, separation),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(computeFishParameters.value.alignmentStrength, alignment),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(computeFishParameters.value.cohesionStrength, cohesion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(computeFishParameters.value.wallRepulsionStrength, wallRepulsion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(
        computeFishParameters.value.mouseRayRepulsionStrength,
        rayRepulsion,
      ),
    );

    fishData.direction = std.mul(
      std.clamp(std.length(fishData.direction), 0.0, 0.01),
      std.normalize(fishData.direction),
    );

    fishData.position = std.add(fishData.position, fishData.direction);
    for (let i = 0; i < 3; i += 1) {
      if (wrappingSides[i] === 0) {
        continue;
      }
      if (fishData.position[i] - fishModelScale > aquariumSize[i] / 2) {
        fishData.position[i] = -aquariumSize[i] / 2;
      } else if (fishData.position[i] + fishModelScale < -aquariumSize[i] / 2) {
        fishData.position[i] = aquariumSize[i] / 2;
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
  position: cameraInitialPosition,
  view: m.mat4.lookAt(
    cameraInitialPosition,
    cameraInitialTarget,
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

const fishParametersBuffer = root
  .createBuffer(FishParameters, fishParameters)
  .$usage('uniform');

const fishDataBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(ModelDataArray(fishAmount))
    .$usage('storage', 'uniform', 'vertex'),
);

const mouseRayBuffer = root.createBuffer(MouseRay).$usage('uniform');

const randomizeFishPositions = () => {
  const positions = Array.from({ length: fishAmount }, () => ({
    position: d.vec3f(
      Math.random() * aquariumSize.x - aquariumSize.x / 2,
      Math.random() * aquariumSize.y - aquariumSize.y / 2,
      Math.random() * aquariumSize.z - aquariumSize.z / 2,
    ),
    direction: d.vec3f(
      Math.random() * 0.1 - 0.05,
      Math.random() * 0.1 - 0.05,
      Math.random() * 0.1 - 0.05,
    ),
    scale: fishModelScale * (1 + (Math.random() - 0.5) * 0.8),
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
  'assets/3d-fishes/fish.obj',
  'assets/3d-fishes/fish.png',
);

// https://www.cgtrader.com/free-3d-models/space/other/rainy-ocean
// https://www.istockphoto.com/pl/obrazy/sand
const oceanFloorModel = await loadModel(
  root,
  'assets/3d-fishes/ocean_floor.obj',
  'assets/3d-fishes/ocean_floor.jpg',
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

const renderFishesBindGroups = [0, 1].map((idx) =>
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
      position: d.vec3f(0, -aquariumSize.y / 2 + 1, 0),
      direction: d.vec3f(1, 0, 0),
      scale: 1,
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
    fishParameters: fishParametersBuffer,
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
    .dispatchWorkgroups(fishAmount / workGroupSize);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [backgroundColor.x, backgroundColor.y, backgroundColor.z, 1],
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
      clearValue: [backgroundColor.x, backgroundColor.y, backgroundColor.z, 1],
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
    .with(renderBindGroupLayout, renderFishesBindGroups[odd ? 1 : 0])
    .draw(fishModel.polygonCount, fishAmount);

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

let cameraRadius = std.length(cameraInitialPosition);
let cameraYaw = Math.atan2(cameraInitialPosition.x, cameraInitialPosition.z);
let cameraPitch = Math.asin(cameraInitialPosition.y / cameraRadius);

function updateCameraOrbit(dx: number, dy: number) {
  cameraYaw += -dx * 0.005;
  cameraPitch += dy * 0.005;

  // if we don't limit pitch, it would lead to flipping the camera which is disorienting.
  const minPitch = 0;
  const maxPitch = Math.PI / 2 - 0.01;
  cameraPitch = std.clamp(cameraPitch, minPitch, maxPitch);

  const newCamX = cameraRadius * Math.sin(cameraYaw) * Math.cos(cameraPitch);
  const newCamY = cameraRadius * Math.sin(cameraPitch);
  const newCamZ = cameraRadius * Math.cos(cameraYaw) * Math.cos(cameraPitch);

  camera.position = d.vec4f(newCamX, newCamY, newCamZ, 1);
  camera.view = m.mat4.lookAt(
    camera.position,
    cameraInitialTarget,
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

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  cameraRadius = std.clamp(cameraRadius + event.deltaY * 0.05, 1, 11);
  const newCamX = cameraRadius * Math.sin(cameraYaw) * Math.cos(cameraPitch);
  const newCamY = cameraRadius * Math.sin(cameraPitch);
  const newCamZ = cameraRadius * Math.cos(cameraYaw) * Math.cos(cameraPitch);
  camera.position = d.vec4f(newCamX, newCamY, newCamZ, 1);
  camera.view = m.mat4.lookAt(
    camera.position,
    cameraInitialTarget,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
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

canvas.addEventListener('mouseup', (event) => {
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

canvas.addEventListener('mousemove', (event) => {
  const dx = event.clientX - previousMouseX;
  const dy = event.clientY - previousMouseY;
  previousMouseX = event.clientX;
  previousMouseY = event.clientY;

  if (isLeftPressed) {
    updateCameraOrbit(dx, dy);
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
