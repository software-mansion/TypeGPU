import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

// data schemas

const FishParameters = d
  .struct({
    separationDistance: d.f32,
    separationStrength: d.f32,
    alignmentDistance: d.f32,
    alignmentStrength: d.f32,
    cohesionDistance: d.f32,
    cohesionStrength: d.f32,
    wallRepulsionDistance: d.f32,
    wallRepulsionStrength: d.f32,
  })
  .$name('FishParameters');

const Camera = d
  .struct({
    view: d.mat4x4f,
    projection: d.mat4x4f,
  })
  .$name('Camera');

const FishData = d.struct({
  position: d.vec4f,
  velocity: d.vec3f,
});

const FishDataArray = (n: number) => d.arrayOf(FishData, n);

const FishModelVertex = d.struct({
  localPosition: d.location(0, d.vec3f),
  normal: d.location(1, d.vec3f),
  uv: d.location(2, d.vec2f),
  instanceIndex: d.location(3, d.builtin.instanceIndex),
});

// constants

const workGroupSize = 256;

const fishAmount = 1024 * 8;
const fishModelScale = 0.01;

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

const initialCameraPos = d.vec4f(2, 2, 2, 1);
const lightColor = d.vec3f(1, 0.8, 0.7);
const lightDirection = std.normalize(d.vec3f(-1.0, 0.0, 0.0));

// layouts

const renderBindGroupLayout = tgpu.bindGroupLayout({
  trianglePos: {
    storage: FishDataArray,
  },
  camera: { uniform: Camera },
  params: { uniform: FishParameters },
  texture: { texture: 'float' },
  sampler: { sampler: 'filtering' },
});

const vertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(FishModelVertex, n),
);

const {
  camera,
  texture: shaderTexture,
  sampler: shaderSampler,
  trianglePos: shaderTrianglePos,
} = renderBindGroupLayout.bound;

const VertexOutput = {
  position: d.builtin.position,
  uv: d.vec2f,
  normals: d.vec3f,
  worldPosition: d.vec4f,
};

const mainVert = tgpu['~unstable']
  .vertexFn({
    in: {
      localPosition: d.vec3f,
      normal: d.vec3f,
      uv: d.vec2f,
      instanceIndex: d.builtin.instanceIndex,
    },
    out: VertexOutput,
  })
  .does((input) => {
    const instance = shaderTrianglePos.value[input.instanceIndex];

    const localPos = d.vec4f(
      input.localPosition.x,
      input.localPosition.y,
      input.localPosition.z,
      1,
    );

    const vel = instance.velocity;
    const normVel = std.normalize(vel);

    const yaw = std.atan2(normVel.z, normVel.x) + Math.PI;
    const yawCos = std.cos(yaw);
    const yawSin = std.sin(yaw);

    // biome-ignore format:
    const yawRotation = d.mat4x4f(
          yawCos,   0, yawSin,  0,
          0,        1, 0,       0,
          -yawSin,  0, yawCos,  0,
          0,        0, 0,       1,
        );

    const pitch = -std.asin(-normVel.y);
    const pitchCos = std.cos(pitch);
    const pitchSin = std.sin(pitch);

    // biome-ignore format:
    const pitchRotation = d.mat4x4f(
          pitchCos, -pitchSin, 0, 0,
          pitchSin, pitchCos,  0, 0,
          0,        0,         1, 0,
          0,        0,         0, 1,
        );

    const worldPos = std.add(
      std.mul(
        yawRotation,
        std.mul(pitchRotation, std.mul(fishModelScale, localPos)),
      ),
      instance.position,
    );

    const uniformNormal = d.vec4f(
      input.normal.x,
      input.normal.y,
      input.normal.z,
      1,
    );
    const worldNormal = std.add(
      std.mul(pitchRotation, std.mul(yawRotation, uniformNormal)),
      instance.position,
    );

    const pos = std.mul(
      camera.value.projection,
      std.mul(camera.value.view, worldPos),
    );

    return {
      position: pos,
      uv: input.uv,
      normals: worldNormal.xyz,
      worldPosition: worldPos,
    };
  });

const sampleTexture = tgpu['~unstable']
  .fn([d.vec2f], d.vec4f)
  .does(/*wgsl*/ `(uv: vec2<f32>) -> vec4<f32> {
      return textureSample(shaderTexture, shaderSampler, uv);
    }`)
  .$uses({ shaderTexture, shaderSampler })
  .$name('sampleShader');

const mainFrag = tgpu['~unstable']
  .fragmentFn({
    in: VertexOutput,
    out: d.location(0, d.vec4f),
  })
  .does((input) => {
    const normal = std.normalize(input.normals);

    // Directional lighting
    const attenuation = std.max(
      std.dot(normal, std.mul(-1, lightDirection)),
      0.0,
    );
    const sunColor = std.mul(attenuation, lightColor);

    const surfaceToLight = std.mul(-1, lightDirection);

    const albedoWithAlpha = sampleTexture(input.uv); // base color
    const albedo = albedoWithAlpha.xyz;
    const ambient = d.vec3f(0.4);

    const surfaceToCamera = std.normalize(
      std.sub(initialCameraPos, input.worldPosition),
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

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);

const cameraInitial = {
  view: m.mat4.lookAt(initialCameraPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const paramsBuffer = root
  .createBuffer(FishParameters, fishParameters)
  .$usage('uniform');
const params = paramsBuffer.as('uniform');

const trianglePosBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(FishDataArray(fishAmount))
    .$usage('storage', 'uniform', 'vertex'),
);

const randomizePositions = () => {
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
  trianglePosBuffers[0].write(positions);
  trianglePosBuffers[1].write(positions);
};
randomizePositions();

const instanceLayout = tgpu.vertexLayout(FishDataArray, 'instance');

const renderPipeline = root['~unstable']
  .withVertex(mainVert, vertexLayout.attrib)
  .withFragment(mainFrag, { format: presentationFormat })
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

const computeBindGroupLayout = tgpu
  .bindGroupLayout({
    currentTrianglePos: { storage: FishDataArray },
    nextTrianglePos: {
      storage: FishDataArray,
      access: 'mutable',
    },
  })
  .$name('compute');

const { currentTrianglePos, nextTrianglePos } = computeBindGroupLayout.bound;

const mainCompute = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [workGroupSize],
  })
  .does(/* wgsl */ `(input: ComputeInput) {    let index = input.gid.x;
    var instanceInfo = currentTrianglePos[index];
    var separation = vec3f();
    var alignment = vec3f();
    var cohesion = vec3f();
    var wallRepulsion = vec3f();
    var alignmentCount = 0u;
    var cohesionCount = 0u;

    for (var i = 0u; i < arrayLength(&currentTrianglePos); i += 1) {
      if (i == index) {
        continue;
      }
      var other = currentTrianglePos[i];
      var dist = distance(instanceInfo.position, other.position);
      if (dist < params.separationDistance) {
        separation += instanceInfo.position.xyz - other.position.xyz;
      }
      if (dist < params.alignmentDistance) {
        alignment += other.velocity;
        alignmentCount++;
      }
      if (dist < params.cohesionDistance) {
        cohesion += other.position.xyz;
        cohesionCount++;
      }
    };
    if (alignmentCount > 0u) {
      alignment = alignment / f32(alignmentCount);
    }
    if (cohesionCount > 0u) {
      cohesion = (cohesion / f32(cohesionCount)) - instanceInfo.position.xyz;
    }
    for (var i = 0u; i< 3; i += 1) {
      var vec = vec3f(0, 0, 0);
      vec[i] = 1.0;
      if (instanceInfo.position[i] > 1 - params.wallRepulsionDistance) {
        wallRepulsion += -1 * vec; 
      }
      if (instanceInfo.position[i] < -1 + params.wallRepulsionDistance) {
        wallRepulsion += 1 * vec; 
      }
    }
      
    instanceInfo.velocity +=
      (separation * params.separationStrength)
      + (alignment * params.alignmentStrength)
      + (cohesion * params.cohesionStrength)
      + (wallRepulsion * params.wallRepulsionStrength);
    instanceInfo.velocity = normalize(instanceInfo.velocity) * clamp(length(instanceInfo.velocity), 0.0, 0.01);

    instanceInfo.position += vec4f(instanceInfo.velocity, 0);
    nextTrianglePos[index] = instanceInfo;
}`)
  .$uses({
    currentTrianglePos,
    nextTrianglePos,
    params,
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

const cubeModel = await load('assets/gravity/blahaj_smooth.obj', OBJLoader);

const sampler = root.device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// model

const vertexBuffer = root
  .createBuffer(
    vertexLayout.schemaForCount(cubeModel.attributes.POSITION.value.length / 3),
  )
  .$usage('vertex')
  .$name('vertex');

const positions = cubeModel.attributes.POSITION.value;
const normals = cubeModel.attributes.NORMAL
  ? cubeModel.attributes.NORMAL.value
  : new Float32Array(positions.length);
const uvs = cubeModel.attributes.TEXCOORD_0
  ? cubeModel.attributes.TEXCOORD_0.value
  : new Float32Array((positions.length / 3) * 2);

const vertices = [];
for (let i = 0; i < positions.length / 3; i++) {
  vertices.push({
    localPosition: d.vec3f(
      positions[3 * i],
      positions[3 * i + 1],
      positions[3 * i + 2],
    ),
    normal: d.vec3f(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]),
    uv: d.vec2f(uvs[2 * i], 1 - uvs[2 * i + 1]),
    instanceIndex: 0,
  });
}
vertices.reverse();

vertexBuffer.write(vertices);

// end of model

const renderBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(renderBindGroupLayout, {
    trianglePos: trianglePosBuffers[idx],
    camera: cameraBuffer,
    params: paramsBuffer,
    texture: cubeTexture,
    sampler,
  }),
);

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
    currentTrianglePos: trianglePosBuffers[idx],
    nextTrianglePos: trianglePosBuffers[1 - idx],
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
    .with(vertexLayout, vertexBuffer)
    .with(instanceLayout, trianglePosBuffers[even ? 1 : 0])
    .with(renderBindGroupLayout, renderBindGroups[even ? 1 : 0])
    .draw(positions.length / 3, fishAmount);

  root['~unstable'].flush();

  requestAnimationFrame(frame);
}

frame();

// #region Example controls and cleanup

export const controls = {
  Randomize: {
    onButtonClick: () => randomizePositions(),
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
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({ view: newView, projection: cameraInitial.projection });
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
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.write({ view: newView, projection: cameraInitial.projection });
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
