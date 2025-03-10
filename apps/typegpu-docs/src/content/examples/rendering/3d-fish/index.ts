import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu, { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

// TODO: split into files
// TODO: update acos and asin to vector functions

// constants

const workGroupSize = 256;

const fishAmount = 1024 * 8;
const fishModelScale = 0.015;

const aquariumSize = d.vec3f(10, 4, 10);
const wrappingSides = d.vec3u(0, 0, 0); // vec3 of bools

const fishSeparationDistance = 0.3;
const fishSeparationStrength = 0.0006;
const fishAlignmentDistance = 0.3;
const fishAlignmentStrength = 0.005;
const fishCohesionDistance = 0.5;
const fishCohesionStrength = 0.0008;
const fishWallRepulsionDistance = 0.1;
const fishWallRepulsionStrength = 0.0001;
const fishMouseRayRepulsionDistance = 0.9;
const fishMouseRayRepulsionStrength = 0.0005;

const cameraInitialPosition = d.vec4f(-5, 0, -5, 1);
const cameraInitialTarget = d.vec4f(0, 0, 0, 1);

const lightColor = d.vec3f(0.8, 0.8, 1);
const lightDirection = std.normalize(d.vec3f(1.0, 1.0, 1.0));
const backgroundColor = d.vec3f(0x00 / 255, 0x7a / 255, 0xcc / 255);

// color helpers

const hsvToRgb = tgpu['~unstable'].fn([d.vec3f], d.vec3f).does((hsv) => {
  const h = hsv.x;
  const s = hsv.y;
  const v = hsv.z;

  const i = std.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = d.f32(0);
  let g = d.f32(0);
  let b = d.f32(0);
  if (i % 6 === 0) {
    r = v;
    g = t;
    b = p;
  } else if (i % 6 === 1) {
    r = q;
    g = v;
    b = p;
  } else if (i % 6 === 2) {
    r = p;
    g = v;
    b = t;
  } else if (i % 6 === 3) {
    r = p;
    g = q;
    b = v;
  } else if (i % 6 === 4) {
    r = t;
    g = p;
    b = v;
  } else {
    r = v;
    g = p;
    b = q;
  }
  return d.vec3f(r, g, b);
});

const rgbToHsv = tgpu['~unstable'].fn([d.vec3f], d.vec3f).does((rgb) => {
  const r = rgb.x;
  const g = rgb.y;
  const b = rgb.z;

  const max = std.max(r, std.max(g, b));
  const min = std.min(r, std.min(g, b));
  const delta = d.f32(max - min);
  let h = d.f32(0);
  let s = d.f32(0);
  if (max === 0) {
    s = 0;
  } else {
    s = delta / max;
  }
  const v = max;

  if (max === min) {
    h = 0;
  } else if (max === r) {
    let cond = d.f32(0);
    if (g < b) {
      cond = 6;
    } else {
      cond = 0;
    }
    h = g - b + delta * cond;
    h /= 6 * delta;
  } else if (max === g) {
    h = b - r + delta * 2;
    h /= 6 * delta;
  } else if (max === b) {
    h = r - g + delta * 4;
    h /= 6 * delta;
  }

  return d.vec3f(h, s, v);
});

// data schemas

const Camera = d.struct({
  position: d.vec4f,
  c_target: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const ModelData = d.struct({
  position: d.vec3f,
  direction: d.vec3f, // in case of the fish, this is also the velocity
  scale: d.f32,
  seaFog: d.u32, // bool
  seaBlindness: d.u32, // bool
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
  seaFog: d.interpolate('flat', d.u32), // bool
  seaBlindness: d.interpolate('flat', d.u32), // bool
} as const;

const MouseRay = d.struct({
  activated: d.u32,
  pointX: d.vec3f,
  pointY: d.vec3f,
});

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
      seaFog: renderModelData.value[input.instanceIndex].seaFog,
      seaBlindness: renderModelData.value[input.instanceIndex].seaBlindness,
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
    // then apply sea fog and sea blindness

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

    const lightedColor = std.add(ambient, std.add(diffuse, specular));

    const distanceFromCamera = distance(
      renderCamera.value.position.xyz,
      input.worldPosition,
    );

    let blindedColor = lightedColor;
    if (input.seaBlindness === 1) {
      const blindedParameter = (distanceFromCamera - 5) / 10;
      const blindedFactor = -std.atan2(blindedParameter, 1) / 3;
      const hsv = rgbToHsv(blindedColor);
      hsv.z += blindedFactor;
      blindedColor = hsvToRgb(hsv);
    }

    let foggedColor = blindedColor;
    if (input.seaFog === 1) {
      const fogParameter = std.max(0, (distanceFromCamera - 1.5) * 0.2);
      const fogFactor = fogParameter / (1 + fogParameter);
      foggedColor = std.mix(foggedColor, backgroundColor, fogFactor);
    }

    return d.vec4f(foggedColor.x, foggedColor.y, foggedColor.z, 1);
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
      if (dist < fishSeparationDistance) {
        separation = std.add(
          separation,
          std.sub(fishData.position, other.position),
        );
      }
      if (dist < fishAlignmentDistance) {
        alignment = std.add(alignment, other.direction);
        alignmentCount = alignmentCount + 1;
      }
      if (dist < fishCohesionDistance) {
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
      const distance = fishWallRepulsionDistance;

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
      const limit = fishMouseRayRepulsionDistance;
      const str =
        std.pow(2, std.clamp(limit - std.length(distanceVector), 0, limit)) - 1;
      rayRepulsion = std.mul(str, std.normalize(distanceVector));
    }

    fishData.direction = std.add(
      fishData.direction,
      std.mul(fishSeparationStrength, separation),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(fishAlignmentStrength, alignment),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(fishCohesionStrength, cohesion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(fishWallRepulsionStrength, wallRepulsion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(fishMouseRayRepulsionStrength, rayRepulsion),
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
  c_target: cameraInitialTarget,
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
      position: d.vec3f(0, -aquariumSize.y / 2 - 1, 0),
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
    .with(renderBindGroupLayout, renderFishBindGroups[odd ? 1 : 0])
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

const cameraRadius = distance(
  cameraInitialPosition.xyz,
  cameraInitialTarget.xyz,
);
let cameraYaw =
  (Math.atan2(cameraInitialPosition.x, cameraInitialPosition.z) + Math.PI) %
  Math.PI;
let cameraPitch = Math.asin(cameraInitialPosition.y / cameraRadius);

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
    cameraInitialPosition,
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
