import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu from 'typegpu';
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
});

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const FishData = d.struct({
  position: d.vec4f,
  velocity: d.vec3f,
});

const FishDataArray = (n: number) => d.arrayOf(FishData, n);

const FishModelVertexInput = {
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
  textureUV: d.vec2f,
  instanceIndex: d.builtin.instanceIndex,
} as const;

const FishModelVertexOutput = {
  // TODO: decide on vec4f or vec3f globally
  worldPosition: d.vec4f,
  worldNormal: d.vec3f,
  canvasPosition: d.builtin.position,
  textureUV: d.vec2f,
} as const;

// constants

const workGroupSize = 256;

const fishAmount = 1024 * 1;
const fishModelScale = 0.05;

// TODO: remove the buffer and struct, just reference the constants
const fishParameters = FishParameters({
  separationDistance: 0.05,
  separationStrength: 0.001,
  alignmentDistance: 0.3,
  alignmentStrength: 0.01,
  cohesionDistance: 0.3,
  cohesionStrength: 0.001,
  wallRepulsionDistance: 0.3,
  wallRepulsionStrength: 0.0002,
});

const cameraInitialPosition = d.vec4f(2, 2, 2, 1);
const cameraInitialTarget = d.vec3f(0, 0, 0);

const lightColor = d.vec3f(1, 0.8, 0.7);
const lightDirection = std.normalize(d.vec3f(-1.0, 0.0, 0.0));

// layouts

const fishModelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(FishModelVertexInput), n),
);

const renderInstanceLayout = tgpu.vertexLayout(FishDataArray, 'instance');

const renderBindGroupLayout = tgpu.bindGroupLayout({
  fishData: { storage: FishDataArray },
  camera: { uniform: Camera },
  fishParameters: { uniform: FishParameters },
  fishTexture: { texture: 'float' },
  fishSampler: { sampler: 'filtering' },
});

const computeBindGroupLayout = tgpu.bindGroupLayout({
  currentFishData: { storage: FishDataArray },
  nextFishData: {
    storage: FishDataArray,
    access: 'mutable',
  },
  fishParameters: { uniform: FishParameters },
});

// render sharers

const {
  camera: renderCamera,
  fishTexture: renderFishTexture,
  fishSampler: renderFishSampler,
  fishData: renderFishData,
} = renderBindGroupLayout.bound;

const vertexShader = tgpu['~unstable']
  .vertexFn({
    in: FishModelVertexInput,
    out: FishModelVertexOutput,
  })
  .does((input) => {
    // rotate the model so that it aligns with model's direction of movement
    // https://simple.wikipedia.org/wiki/Pitch,_yaw,_and_roll
    const fishData = renderFishData.value[input.instanceIndex];

    const modelPosition = d.vec4f(
      input.modelPosition.x,
      input.modelPosition.y,
      input.modelPosition.z,
      1,
    );

    const direction = std.normalize(fishData.velocity);

    const yaw = std.atan2(direction.z, direction.x) + Math.PI;
    // biome-ignore format:
    const yawMatrix = d.mat4x4f(
          std.cos(yaw),  0, std.sin(yaw), 0,
          0,             1, 0,            0,
          -std.sin(yaw), 0, std.cos(yaw), 0,
          0,             0, 0,            1,
        );

    const pitch = -std.asin(-direction.y);
    // biome-ignore format:
    const pitchMatrix = d.mat4x4f(
          std.cos(pitch), -std.sin(pitch), 0, 0,
          std.sin(pitch), std.cos(pitch),  0, 0,
          0,              0,               1, 0,
          0,              0,               0, 1,
        );

    const worldPosition = std.add(
      std.mul(
        yawMatrix,
        std.mul(pitchMatrix, std.mul(fishModelScale, modelPosition)),
      ),
      fishData.position,
    );

    // calculate where the normal vector points to
    const uniformNormal = d.vec4f(
      input.modelNormal.x,
      input.modelNormal.y,
      input.modelNormal.z,
      1,
    );
    const worldNormal = std.normalize(
      std.add(
        std.mul(pitchMatrix, std.mul(yawMatrix, uniformNormal)),
        fishData.position,
      ).xyz,
    );

    // project the world position into the camera
    const canvasPosition = std.mul(
      renderCamera.value.projection,
      std.mul(renderCamera.value.view, worldPosition),
    );

    return {
      canvasPosition: canvasPosition,
      textureUV: input.textureUV,
      worldNormal: worldNormal.xyz,
      worldPosition: worldPosition,
    };
  });

const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
      return textureSample(shaderTexture, shaderSampler, uv);
    }`)
  .$uses({ shaderTexture: renderFishTexture, shaderSampler: renderFishSampler })
  .$name('sampleShader');

const fragmentShader = tgpu['~unstable']
  .fragmentFn({
    in: FishModelVertexOutput,
    out: d.location(0, d.vec4f),
  })
  .does((input) => {
    // Directional lighting in Phong reflection model
    // https://en.wikipedia.org/wiki/Phong_reflection_model
    const normal = input.worldNormal;

    const attenuation = std.max(
      std.dot(normal, std.mul(-1, lightDirection)),
      0.0,
    );
    const sunColor = std.mul(attenuation, lightColor);

    const surfaceToLight = std.mul(-1, lightDirection);

    const albedoWithAlpha = sampleTexture(input.textureUV); // base color
    const albedo = albedoWithAlpha.xyz;
    const ambient = d.vec3f(0.4);

    const surfaceToCamera = std.normalize(
      std.sub(cameraInitialPosition, input.worldPosition),
    );

    const halfVector = std.normalize(
      std.add(surfaceToLight, surfaceToCamera.xyz),
    );
    const specular = std.pow(std.max(std.dot(normal, halfVector), 0.0), 3);

    const finalColor = std.add(
      std.mul(albedo, std.add(ambient, sunColor)),
      std.mul(specular, lightColor),
    );
    return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1);
  })
  .$name('mainFragment');

// compute shader

const distance = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f], d.f32)
  .does((v1, v2) => {
    const diff = std.sub(v1, v2);
    return std.pow(diff.x * diff.x + diff.y * diff.y + diff.z * diff.z, 0.5);
  });

const {
  currentFishData: computeCurrentFishData,
  nextFishData: computeNextFishData,
  fishParameters: computeFishParameters,
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

    for (let i = 0; i < fishAmount; i += 1) {
      if (d.u32(i) === fishIndex) {
        continue;
      }
      const other = computeCurrentFishData.value[i];
      const dist = distance(fishData.position.xyz, other.position.xyz);
      if (dist < computeFishParameters.value.separationDistance) {
        separation = std.add(
          separation,
          std.sub(fishData.position.xyz, other.position.xyz),
        );
      }
      if (dist < computeFishParameters.value.alignmentDistance) {
        alignment = std.add(alignment, other.velocity);
        alignmentCount = alignmentCount + 1;
      }
      if (dist < computeFishParameters.value.cohesionDistance) {
        cohesion = std.add(cohesion, other.position.xyz);
        cohesionCount = cohesionCount + 1;
      }
    }
    if (alignmentCount > 0) {
      alignment = std.mul(1 / d.f32(alignmentCount), alignment);
    }
    if (cohesionCount > 0) {
      cohesion = std.sub(
        std.mul(1 / d.f32(cohesionCount), cohesion),
        fishData.position.xyz,
      );
    }
    for (let i = 0; i < 3; i += 1) {
      const vec = d.vec3f(0, 0, 0);
      vec[i] = 1.0;
      if (
        fishData.position[i] >
        1 - computeFishParameters.value.wallRepulsionDistance
      ) {
        wallRepulsion = std.add(wallRepulsion, std.mul(-1, vec));
      }
      if (
        fishData.position[i] <
        -1 + computeFishParameters.value.wallRepulsionDistance
      ) {
        wallRepulsion = std.add(wallRepulsion, std.mul(1, vec));
      }
    }

    fishData.velocity = std.add(
      fishData.velocity,
      std.mul(computeFishParameters.value.separationStrength, separation),
    );
    fishData.velocity = std.add(
      fishData.velocity,
      std.mul(computeFishParameters.value.alignmentStrength, alignment),
    );
    fishData.velocity = std.add(
      fishData.velocity,
      std.mul(computeFishParameters.value.cohesionStrength, cohesion),
    );
    fishData.velocity = std.add(
      fishData.velocity,
      std.mul(computeFishParameters.value.wallRepulsionStrength, wallRepulsion),
    );

    fishData.velocity = std.mul(
      std.clamp(std.length(fishData.velocity), 0.0, 0.01),
      std.normalize(fishData.velocity),
    );

    const velocityUniform = d.vec4f(
      fishData.velocity.x,
      fishData.velocity.y,
      fishData.velocity.z,
      0,
    );
    fishData.position = std.add(fishData.position, velocityUniform);
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

const cameraInitialValue = {
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

const cameraBuffer = root
  .createBuffer(Camera, cameraInitialValue)
  .$usage('uniform');

const fishParametersBuffer = root
  .createBuffer(FishParameters, fishParameters)
  .$usage('uniform');

const fishDataBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(FishDataArray(fishAmount))
    .$usage('storage', 'uniform', 'vertex'),
);

const randomizeFishPositions = () => {
  const positions = Array.from({ length: fishAmount }, () => ({
    position: d.vec4f(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      1,
    ),
    velocity: d.vec3f(
      Math.random() * 0.1 - 0.05,
      Math.random() * 0.1 - 0.05,
      0,
    ),
    alive: 1,
  }));
  fishDataBuffers[0].write(positions);
  fishDataBuffers[1].write(positions);
};
randomizeFishPositions();

// fish model

const fishModel = await load('assets/gravity/blahaj_smooth.obj', OBJLoader);
const fishModelPolygonCount = fishModel.attributes.POSITION.value.length / 3;

const fishVertexBuffer = root
  .createBuffer(fishModelVertexLayout.schemaForCount(fishModelPolygonCount))
  .$usage('vertex')
  .$name('vertex');

const fishModelVertices = [];
for (let i = 0; i < fishModelPolygonCount; i++) {
  fishModelVertices.push({
    modelPosition: d.vec3f(
      fishModel.attributes.POSITION.value[3 * i],
      fishModel.attributes.POSITION.value[3 * i + 1],
      fishModel.attributes.POSITION.value[3 * i + 2],
    ),
    modelNormal: d.vec3f(
      fishModel.attributes.NORMAL.value[3 * i],
      fishModel.attributes.NORMAL.value[3 * i + 1],
      fishModel.attributes.NORMAL.value[3 * i + 2],
    ),
    textureUV: d.vec2f(
      fishModel.attributes.TEXCOORD_0.value[2 * i],
      1 - fishModel.attributes.TEXCOORD_0.value[2 * i + 1],
    ),
    instanceIndex: 0,
  });
}
fishModelVertices.reverse();

fishVertexBuffer.write(fishModelVertices);

// reszta

const renderPipeline = root['~unstable']
  .withVertex(vertexShader, fishModelVertexLayout.attrib)
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

const textureResponse = await fetch('assets/gravity/texture.png');
const imageBitmap = await createImageBitmap(await textureResponse.blob());
const cubeTexture = root['~unstable']
  .createTexture({
    size: [imageBitmap.width, imageBitmap.height],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');

root.device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: root.unwrap(cubeTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const sampler = root.device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// end of model

const renderBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(renderBindGroupLayout, {
    fishData: fishDataBuffers[idx],
    camera: cameraBuffer,
    fishParameters: fishParametersBuffer,
    fishTexture: cubeTexture,
    fishSampler: sampler,
  }),
);

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
    currentFishData: fishDataBuffers[idx],
    nextFishData: fishDataBuffers[1 - idx],
    fishParameters: fishParametersBuffer,
  }),
);

// unoptimized background cube
let drawCube: () => void;
{
  const Vertex = d.struct({
    position: d.vec4f,
    color: d.vec4f,
  });

  const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

  function getColor(): d.Infer<typeof Vertex>['color'] {
    return d.vec4f(173 / 255 + Math.random() / 5, 216 / 255, 230 / 255, 0.9);
  }

  function createFace(vertices: number[][]): d.Infer<typeof Vertex>[] {
    return vertices.map((pos) => ({
      position: d.vec4f(...(pos as [number, number, number, number])),
      color: getColor(),
    }));
  }

  function createCube(): d.Infer<typeof Vertex>[] {
    const front = createFace([
      [-1, -1, 1, 1],
      [1, -1, 1, 1],
      [1, 1, 1, 1],
      [-1, -1, 1, 1],
      [1, 1, 1, 1],
      [-1, 1, 1, 1],
    ]);
    const back = createFace([
      [-1, -1, -1, 1],
      [-1, 1, -1, 1],
      [1, -1, -1, 1],
      [1, -1, -1, 1],
      [-1, 1, -1, 1],
      [1, 1, -1, 1],
    ]);
    const top = createFace([
      [-1, 1, -1, 1],
      [-1, 1, 1, 1],
      [1, 1, -1, 1],
      [1, 1, -1, 1],
      [-1, 1, 1, 1],
      [1, 1, 1, 1],
    ]);
    const bottom = createFace([
      [-1, -1, -1, 1],
      [1, -1, -1, 1],
      [-1, -1, 1, 1],
      [1, -1, -1, 1],
      [1, -1, 1, 1],
      [-1, -1, 1, 1],
    ]);
    const right = createFace([
      [1, -1, -1, 1],
      [1, 1, -1, 1],
      [1, -1, 1, 1],
      [1, -1, 1, 1],
      [1, 1, -1, 1],
      [1, 1, 1, 1],
    ]);
    const left = createFace([
      [-1, -1, -1, 1],
      [-1, -1, 1, 1],
      [-1, 1, -1, 1],
      [-1, -1, 1, 1],
      [-1, 1, 1, 1],
      [-1, 1, -1, 1],
    ]);
    return [...front, ...back, ...top, ...bottom, ...right, ...left];
  }

  const cubeBuffer = root
    .createBuffer(vertexLayout.schemaForCount(36), createCube())
    .$usage('vertex');

  const bindGroupLayout = tgpu.bindGroupLayout({
    camera: { uniform: Camera },
  });
  const { camera } = bindGroupLayout.bound;

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    camera: cameraBuffer,
  });

  const vertex = tgpu['~unstable']
    .vertexFn({
      in: { position: d.vec4f, color: d.vec4f },
      out: { pos: d.builtin.position, color: d.vec4f },
    })
    .does((input) => {
      const pos = std.mul(
        camera.value.projection,
        std.mul(camera.value.view, input.position),
      );
      return { pos, color: input.color };
    });

  const fragment = tgpu['~unstable']
    .fragmentFn({
      in: { color: d.vec4f },
      out: d.vec4f,
    })
    .does((input) => input.color);

  const pipeline = root['~unstable']
    .withVertex(vertex, vertexLayout.attrib)
    .withFragment(fragment, { format: presentationFormat })
    .createPipeline();

  drawCube = () => {
    pipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'load',
        storeOp: 'store',
      })
      .with(vertexLayout, cubeBuffer)
      .with(bindGroupLayout, bindGroup)
      .draw(36);
    root['~unstable'].flush();
  };
}

let even = false;
let disposed = false;
function frame() {
  if (disposed) {
    return;
  }

  drawCube();

  even = !even;
  computePipeline
    .with(computeBindGroupLayout, computeBindGroups[even ? 0 : 1])
    .dispatchWorkgroups(fishAmount / workGroupSize);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'load' as const,
      storeOp: 'store' as const,
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(fishModelVertexLayout, fishVertexBuffer)
    .with(renderInstanceLayout, fishDataBuffers[even ? 1 : 0])
    .with(renderBindGroupLayout, renderBindGroups[even ? 1 : 0])
    .draw(fishModelPolygonCount, fishAmount);

  root['~unstable'].flush();

  requestAnimationFrame(frame);
}

frame();

// #region Example controls and cleanup

export const controls = {
  Randomize: {
    onButtonClick: () => randomizeFishPositions(),
  },
  'boids count': {
    initial: fishAmount,
    options: [4, 16, 64, 256, 1024, 4096].map((x) => x.toString()),
    onSelectChange(value: string) {
      const num = Number.parseInt(value);
      // triangleAmount = num;

      // const oldBuffers = trianglePosBuffers;
      // trianglePosBuffers = generateBuffers(triangleAmount);
      // oldBuffers.forEach((buffer, _) => {
      //   buffer.destroy();
      // });
    },
  },
};

// Variables for mouse interaction.
let isRightDragging = false;
let rightPrevX = 0;
let rightPrevY = 0;
const initialCamX = 2;
const initialCamY = 2;
const initialCamZ = 2;
let orbitRadius = Math.sqrt(
  initialCamX * initialCamX +
    initialCamY * initialCamY +
    initialCamZ * initialCamZ,
);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(initialCamX, initialCamZ);
let orbitPitch = Math.asin(initialCamY / orbitRadius);

// Helper functions for updating transforms.
function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.005;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += dy * orbitSensitivity;
  // if we don't limit pitch, it would lead to flipping the camera which is disorienting.
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  // basically converting spherical coordinates to cartesian.
  // like sampling points on a unit sphere and then scaling them by the radius.
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

  const newView = m.mat4.lookAt(
    newCameraPos,
    cameraInitialTarget,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({
    view: newView,
    projection: cameraInitialValue.projection,
  });
}

// Prevent the context menu from appearing on right click.
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  orbitRadius = Math.max(1, orbitRadius + event.deltaY * zoomSensitivity);
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  const newView = m.mat4.lookAt(
    newCameraPos,
    cameraInitialTarget,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({
    view: newView,
    projection: cameraInitialValue.projection,
  });
});

canvas.addEventListener('mousedown', (event) => {
  if (event.button === 0) {
    // Left Mouse Button controls Camera Orbit.
    isRightDragging = true;
    rightPrevX = event.clientX;
    rightPrevY = event.clientY;
  }
});

canvas.addEventListener('mouseup', (event) => {
  if (event.button === 0) {
    isRightDragging = false;
  }
});

canvas.addEventListener('mousemove', (event) => {
  if (isRightDragging) {
    const dx = event.clientX - rightPrevX;
    const dy = event.clientY - rightPrevY;
    rightPrevX = event.clientX;
    rightPrevY = event.clientY;
    updateCameraOrbit(dx, dy);
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
