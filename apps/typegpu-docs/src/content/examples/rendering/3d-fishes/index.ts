import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

const triangleAmount = 1000;
const triangleSize = 0.03;

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
  .does(/* wgsl */ `
  (velocity: vec2f) -> f32 {
    return -atan2(velocity.x, velocity.y);
  }
`);

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const TriangleData = d.struct({
  position: d.vec4f,
  velocity: d.vec3f,
});

const renderBindGroupLayout = tgpu.bindGroupLayout({
  trianglePos: { uniform: d.arrayOf(TriangleData, triangleAmount) },
  colorPalette: { uniform: d.vec3f },
  camera: { uniform: Camera },
});

const { trianglePos, colorPalette, camera } = renderBindGroupLayout.bound;

const VertexOutput = {
  position: d.builtin.position,
  color: d.vec4f,
};

const mainVert = tgpu['~unstable']
  .vertexFn({
    in: { v: d.vec4f, center: d.vec4f, velocity: d.vec3f },
    out: VertexOutput,
  })
  .does((input) => {
    const angle = getRotationFromVelocity(input.velocity.xy);
    const rotated = rotate(input.v.xy, angle);

    const translated = std.add(rotated, input.center.xy);
    let pos = d.vec4f(
      translated.x,
      translated.y,
      input.center.z,
      input.center.w,
    );
    pos = std.mul(camera.value.projection, std.mul(camera.value.view, pos));

    const color = d.vec4f(
      std.sin(angle + colorPalette.value.x) * 0.45 + 0.45,
      std.sin(angle + colorPalette.value.y) * 0.45 + 0.45,
      std.sin(angle + colorPalette.value.z) * 0.45 + 0.45,
      1.0,
    );

    return { position: pos, color };
  });

const mainFrag = tgpu['~unstable']
  .fragmentFn({ in: VertexOutput, out: d.vec4f })
  .does((input) => input.color);

const Params = d
  .struct({
    separationDistance: d.f32,
    separationStrength: d.f32,
    alignmentDistance: d.f32,
    alignmentStrength: d.f32,
    cohesionDistance: d.f32,
    cohesionStrength: d.f32,
  })
  .$name('Params');

type Params = d.Infer<typeof Params>;

const colorPresets = {
  jeans: d.vec3f(2.0, 1.5, 1.0),
};

const presets = {
  default: {
    separationDistance: 0.05,
    separationStrength: 0.001,
    alignmentDistance: 0.3,
    alignmentStrength: 0.01,
    cohesionDistance: 0.3,
    cohesionStrength: 0.001,
  },
} as const;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

const aspect = canvas.clientWidth / canvas.clientHeight;
const target = d.vec3f(0, 0, 0);
const cameraInitialPos = d.vec4f(10, 2, 10, 1);

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

const paramsBuffer = root
  .createBuffer(Params, presets.default)
  .$usage('uniform');
const params = paramsBuffer.as('uniform');

const triangleVertexBuffer = root
  .createBuffer(d.arrayOf(d.vec4f, 3), [
    d.vec4f(0.0, triangleSize, 0.0, 1.0),
    d.vec4f(-triangleSize / 2, -triangleSize / 2, 0.0, 1.0),
    d.vec4f(triangleSize / 2, -triangleSize / 2, 0.0, 1.0),
  ])
  .$usage('vertex');

const trianglePosBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(d.arrayOf(TriangleData, triangleAmount))
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
  }));
  trianglePosBuffers[0].write(positions);
  trianglePosBuffers[1].write(positions);
};
randomizePositions();

const colorPaletteBuffer = root
  .createBuffer(d.vec3f, colorPresets.jeans)
  .$usage('uniform');

const TriangleDataArray = (n: number) => d.arrayOf(TriangleData, n);

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(d.vec4f, n));
const instanceLayout = tgpu.vertexLayout(TriangleDataArray, 'instance');

const renderPipeline = root['~unstable']
  .withVertex(mainVert, {
    v: vertexLayout.attrib,
    center: instanceLayout.attrib.position,
    velocity: instanceLayout.attrib.velocity,
  })
  .withFragment(mainFrag, {
    format: presentationFormat,
  })
  .createPipeline()
  .with(vertexLayout, triangleVertexBuffer);

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
  .computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [1] })
  .does(/* wgsl */ `(input: ComputeInput) {
    let index = input.gid.x;
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
      
    instanceInfo.velocity +=
      (separation * params.separationStrength)
      + (alignment * params.alignmentStrength)
      + (cohesion * params.cohesionStrength);
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
  .$uses({ currentTrianglePos, nextTrianglePos, params, triangleSize });

const computePipeline = root['~unstable']
  .withCompute(mainCompute)
  .createPipeline();

const renderBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(renderBindGroupLayout, {
    trianglePos: trianglePosBuffers[idx],
    colorPalette: colorPaletteBuffer,
    camera: cameraBuffer,
  }),
);

const computeBindGroups = [0, 1].map((idx) =>
  root.createBindGroup(computeBindGroupLayout, {
    currentTrianglePos: trianglePosBuffers[idx],
    nextTrianglePos: trianglePosBuffers[1 - idx],
  }),
);

let even = false;
let disposed = false;

function frame() {
  if (disposed) {
    return;
  }

  even = !even;

  computePipeline
    .with(computeBindGroupLayout, computeBindGroups[even ? 0 : 1])
    .dispatchWorkgroups(triangleAmount);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear' as const,
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
};

// Variables for mouse interaction.
let isRightDragging = false;
let rightPrevX = 0;
let rightPrevY = 0;
const initialCamX = 10;
const initialCamY = 2;
const initialCamZ = 10;
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
  orbitPitch += -dy * orbitSensitivity;
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
