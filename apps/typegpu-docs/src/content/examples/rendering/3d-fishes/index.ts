import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

const triangleAmount = 10000;
const workGroupSize = 250;
const triangleSize = 0.03;

const Params = d
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
  .$name('Params');

type Params = d.Infer<typeof Params>;

const colorPresets = {
  jeans: d.vec3f(2.0, 1.5, 1.0),
};

const defaultParams: Params = {
  separationDistance: 0.05,
  separationStrength: 0.001,
  alignmentDistance: 0.3,
  alignmentStrength: 0.01,
  cohesionDistance: 0.3,
  cohesionStrength: 0.001,
  wallRepulsionDistance: 0.3,
  wallRepulsionStrength: 0.0002,
};

const rotate = tgpu['~unstable']
  .fn([d.vec2f, d.f32], d.vec2f)
  .does((v, angle) => {
    const pos = d.vec2f(
      v.x * std.cos(angle) - v.y * std.sin(angle),
      v.x * std.sin(angle) + v.y * std.cos(angle),
    );
    return pos;
  });

const getRotationFromVelocity = tgpu['~unstable']
  .fn([d.vec2f], d.f32)
  .does((velocity) => -std.atan2(velocity.x, velocity.y));

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const TriangleData = d.struct({
  position: d.vec4f,
  velocity: d.vec3f,
  alive: d.u32,
});

const TriangleDataArray = (n: number) => d.arrayOf(TriangleData, n);
const renderBindGroupLayout = tgpu.bindGroupLayout({
  trianglePos: {
    storage: TriangleDataArray,
  },
  colorPalette: { uniform: d.vec3f },
  camera: { uniform: Camera },
  params: { uniform: Params },
});

const { camera } = renderBindGroupLayout.bound;

const VertexOutput = {
  trianglePosition: d.vec4f,
  position: d.builtin.position,
};

const mainVert = tgpu['~unstable']
  .vertexFn({
    in: {
      center: d.vec4f,
      velocity: d.vec3f,
      vertexIndex: d.builtin.vertexIndex,
      alive: d.u32,
    },
    out: VertexOutput,
  })
  .does((input) => {
    const v0 = d.vec4f(0.0, triangleSize, 0.0, 1.0);
    const v1 = d.vec4f(-triangleSize / 2, -triangleSize / 2, 0.0, 1.0);
    const v2 = d.vec4f(triangleSize / 2, -triangleSize / 2, 0.0, 1.0);
    let v: d.v4f = d.vec4f();
    if (input.vertexIndex === 0) {
      v = v0;
    } else if (input.vertexIndex === 1) {
      v = v1;
    } else {
      v = v2;
    }

    const angle = getRotationFromVelocity(input.velocity.xy);
    const rotated = rotate(v.xy, angle);

    const translated = std.add(rotated, input.center.xy);
    let pos = d.vec4f(
      translated.x,
      translated.y,
      input.center.z,
      input.center.w,
    );
    pos = std.mul(camera.value.projection, std.mul(camera.value.view, pos));

    return { position: pos, trianglePosition: input.center };
  });

const mainFrag = tgpu['~unstable']
  .fragmentFn({ in: VertexOutput, out: d.vec4f })
  .does(() => d.vec4f(1, 0, 0, 1));

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(2, 2, 2, 1);

const cameraInitial = {
  view: m.mat4.lookAt(cameraInitialPos, target, d.vec3f(0, 1, 0), d.mat4x4f()),
  projection: m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, d.mat4x4f()),
};

const cameraBuffer = root.createBuffer(Camera, cameraInitial).$usage('uniform');

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const paramsBuffer = root.createBuffer(Params, defaultParams).$usage('uniform');
const params = paramsBuffer.as('uniform');

const trianglePosBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(TriangleDataArray(triangleAmount))
    .$usage('storage', 'uniform', 'vertex'),
);

const randomizePositions = () => {
  const positions = Array.from({ length: triangleAmount }, () => ({
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

const colorPaletteBuffer = root
  .createBuffer(d.vec3f, colorPresets.jeans)
  .$usage('uniform');

const instanceLayout = tgpu.vertexLayout(TriangleDataArray, 'instance');

const renderPipeline = root['~unstable']
  .withVertex(mainVert, {
    center: instanceLayout.attrib.position,
    velocity: instanceLayout.attrib.velocity,
    alive: instanceLayout.attrib.alive,
  })
  .withFragment(mainFrag, {
    format: presentationFormat,
  })
  .createPipeline();

const computeBindGroupLayout = tgpu
  .bindGroupLayout({
    currentTrianglePos: { storage: TriangleDataArray },
    nextTrianglePos: {
      storage: TriangleDataArray,
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

    if (instanceInfo.position[0] > 1.0 + triangleSize) {
      instanceInfo.position[0] = -1.0 - triangleSize;
    }
    if (instanceInfo.position[1] > 1.0 + triangleSize) {
      instanceInfo.position[1] = -1.0 - triangleSize;
    }
    if (instanceInfo.position[2] > 1.0 + triangleSize) {
      instanceInfo.position[2] = -1.0 - triangleSize;
    }
    if (instanceInfo.position[0] < -1.0 - triangleSize) {
      instanceInfo.position[0] = 1.0 + triangleSize;
    }
    if (instanceInfo.position[1] < -1.0 - triangleSize) {
      instanceInfo.position[1] = 1.0 + triangleSize;
    }
    if (instanceInfo.position[2] < -1.0 - triangleSize) {
      instanceInfo.position[2] = 1.0 + triangleSize;
    }
    instanceInfo.position += vec4f(instanceInfo.velocity, 0);
    nextTrianglePos[index] = instanceInfo;
}`)
  .$uses({
    currentTrianglePos,
    nextTrianglePos,
    params,
    triangleSize,
  });

const computePipeline = root['~unstable']
  .withCompute(mainCompute)
  .createPipeline();

const renderBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(renderBindGroupLayout, {
    trianglePos: trianglePosBuffers[idx],
    colorPalette: colorPaletteBuffer,
    camera: cameraBuffer,
    params: paramsBuffer,
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
    .dispatchWorkgroups(triangleAmount / workGroupSize);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'load' as const,
      storeOp: 'store' as const,
    })
    .with(instanceLayout, trianglePosBuffers[even ? 1 : 0])
    .with(renderBindGroupLayout, renderBindGroups[even ? 1 : 0])
    .draw(3, triangleAmount);

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
    initial: triangleAmount,
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

// const resizeObserver = new ResizeObserver(() => {
//   depthTexture.destroy();
//   depthTexture = root.device.createTexture({
//     size: [context.canvas.width, context.canvas.height, 1],
//     format: 'depth24plus',
//     usage: GPUTextureUsage.RENDER_ATTACHMENT,
//   });
// });
// resizeObserver.observe(canvas);

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
