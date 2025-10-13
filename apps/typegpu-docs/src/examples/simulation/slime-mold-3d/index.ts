import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';
import * as m from 'wgpu-matrix';

const root = await tgpu.init({
  device: {
    optionalFeatures: ['float32-filterable'],
  },
});
const canFilter = root.enabledFeatures.has('float32-filterable');
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const VOLUME_SIZE = 256;
const NUM_AGENTS = 800_000;
const AGENT_WORKGROUP_SIZE = 64;
const BLUR_WORKGROUP_SIZE = [4, 4, 4];

const CAMERA_FOV_DEGREES = 60;
const CAMERA_DISTANCE_MULTIPLIER = 1.5;
const CAMERA_INITIAL_ANGLE = Math.PI / 4;

const RAYMARCH_STEPS = 128;
const DENSITY_MULTIPLIER = 0.05;

const RANDOM_DIRECTION_WEIGHT = 0.3;
const CENTER_BIAS_WEIGHT = 0.7;

const DEFAULT_MOVE_SPEED = 30.0;
const DEFAULT_SENSOR_ANGLE = 0.5;
const DEFAULT_SENSOR_DISTANCE = 9.0;
const DEFAULT_TURN_SPEED = 10.0;
const DEFAULT_EVAPORATION_RATE = 0.05;

const resolution = d.vec3f(VOLUME_SIZE);

const Camera = d.struct({
  viewProj: d.mat4x4f,
  invViewProj: d.mat4x4f,
  position: d.vec3f,
});

const cameraTarget = resolution.div(2);
const cameraUp = d.vec3f(0, 1, 0);
const fov = (CAMERA_FOV_DEGREES * Math.PI) / 180;
const aspect = canvas.width / canvas.height;
const near = 0.1;
const far = 1000.0;

let cameraDistance = Math.max(resolution.x, resolution.y, resolution.z) *
  CAMERA_DISTANCE_MULTIPLIER;
let cameraTheta = CAMERA_INITIAL_ANGLE; // azimuth
let cameraPhi = CAMERA_INITIAL_ANGLE; // elevation

const updateCamera = () => {
  const cameraPos = cameraTarget.add(d.vec3f(
    cameraDistance * Math.sin(cameraPhi) * Math.cos(cameraTheta),
    cameraDistance * Math.cos(cameraPhi),
    cameraDistance * Math.sin(cameraPhi) * Math.sin(cameraTheta),
  ));

  const view = m.mat4.lookAt(cameraPos, cameraTarget, cameraUp, d.mat4x4f());
  const proj = m.mat4.perspective(fov, aspect, near, far, d.mat4x4f());
  const viewProj = m.mat4.mul(proj, view, d.mat4x4f());
  const invViewProj = m.mat4.invert(viewProj, d.mat4x4f());

  cameraData.write({
    viewProj,
    invViewProj,
    position: cameraPos,
  });
};

const cameraData = root.createUniform(Camera, {
  viewProj: d.mat4x4f.identity(),
  invViewProj: d.mat4x4f.identity(),
  position: d.vec3f(),
});

updateCamera();

const Agent = d.struct({
  position: d.vec3f,
  direction: d.vec3f,
});

const Params = d.struct({
  deltaTime: d.f32,
  moveSpeed: d.f32,
  sensorAngle: d.f32,
  sensorDistance: d.f32,
  turnSpeed: d.f32,
  evaporationRate: d.f32,
});

const agentsData = root.createMutable(d.arrayOf(Agent, NUM_AGENTS));

prepareDispatch(root, (x) => {
  'use gpu';
  randf.seed(x / NUM_AGENTS);
  const pos = randf.inUnitSphere().mul(resolution.x / 4).add(resolution.div(2));
  const center = resolution.div(2);
  const dir = std.normalize(center.sub(pos));
  agentsData.$[x] = Agent({ position: pos, direction: dir });
}).dispatch(NUM_AGENTS);

const params = root.createUniform(Params, {
  deltaTime: 0,
  moveSpeed: DEFAULT_MOVE_SPEED,
  sensorAngle: DEFAULT_SENSOR_ANGLE,
  sensorDistance: DEFAULT_SENSOR_DISTANCE,
  turnSpeed: DEFAULT_TURN_SPEED,
  evaporationRate: DEFAULT_EVAPORATION_RATE,
});

const textures = [0, 1].map(() =>
  root['~unstable']
    .createTexture({
      size: [resolution.x, resolution.y, resolution.z],
      format: 'r32float',
      dimension: '3d',
    })
    .$usage('sampled', 'storage')
);

const computeLayout = tgpu.bindGroupLayout({
  oldState: { storageTexture: d.textureStorage3d('r32float', 'read-only') },
  newState: { storageTexture: d.textureStorage3d('r32float', 'write-only') },
});

const renderLayout = tgpu.bindGroupLayout({
  state: {
    texture: d.texture3d(),
    sampleType: canFilter ? 'float' : 'unfilterable-float',
  },
});

const SenseResult = d.struct({
  weightedDir: d.vec3f,
  totalWeight: d.f32,
});

const RayBoxResult = d.struct({
  tNear: d.f32,
  tFar: d.f32,
  hit: d.bool,
});

const getPerpendicular = (dir: d.v3f) => {
  'use gpu';
  let axis = d.vec3f(1, 0, 0);

  // Find the axis that is least aligned
  const absX = std.abs(dir.x);
  const absY = std.abs(dir.y);
  const absZ = std.abs(dir.z);

  if (absY <= absX && absY <= absZ) {
    axis = d.vec3f(0, 1, 0);
  } else if (absZ <= absX && absZ <= absY) {
    axis = d.vec3f(0, 0, 1);
  }

  return std.normalize(std.cross(dir, axis));
};

const sense3D = (pos: d.v3f, direction: d.v3f) => {
  'use gpu';
  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec3f(dims);

  let weightedDir = d.vec3f();
  let totalWeight = d.f32();

  const perp1 = getPerpendicular(direction);
  const perp2 = std.cross(direction, perp1);

  const numSamples = 8;
  for (let i = 0; i < numSamples; i++) {
    const theta = (i / numSamples) * 2 * Math.PI;

    const coneOffset = perp1.mul(std.cos(theta)).add(perp2.mul(std.sin(theta)));
    const sensorDir = std.normalize(
      direction.add(coneOffset.mul(std.sin(params.$.sensorAngle))),
    );

    const sensorPos = pos.add(sensorDir.mul(params.$.sensorDistance));
    const sensorPosInt = d.vec3u(
      std.clamp(sensorPos, d.vec3f(), dimsf.sub(d.vec3f(1))),
    );

    const weight = std.textureLoad(computeLayout.$.oldState, sensorPosInt).x;

    weightedDir = weightedDir.add(sensorDir.mul(weight));
    totalWeight = totalWeight + weight;
  }

  return SenseResult({ weightedDir, totalWeight });
};

const updateAgents = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [AGENT_WORKGROUP_SIZE],
})(({ gid }) => {
  if (gid.x >= NUM_AGENTS) {
    return;
  }

  randf.seed(gid.x / NUM_AGENTS + 0.1);

  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec3f(dims);

  const agent = agentsData.$[gid.x];
  const random = randf.sample();

  let direction = std.normalize(agent.direction);
  const senseResult = sense3D(agent.position, direction);

  if (senseResult.totalWeight > 0.01) {
    const targetDir = std.normalize(senseResult.weightedDir);
    direction = std.normalize(
      direction.add(targetDir.mul(params.$.turnSpeed * params.$.deltaTime)),
    );
  } else {
    const perp = getPerpendicular(direction);
    const randomOffset = perp.mul(
      (random * 2 - 1) * params.$.turnSpeed * params.$.deltaTime,
    );
    direction = std.normalize(direction.add(randomOffset));
  }

  const newPos = agent.position.add(
    direction.mul(params.$.moveSpeed * params.$.deltaTime),
  );

  const center = dimsf.div(2);

  if (newPos.x < 0 || newPos.x >= dimsf.x) {
    newPos.x = std.clamp(newPos.x, 0, dimsf.x - 1);
    let normal = d.vec3f(1, 0, 0);
    if (newPos.x > 1) {
      normal = d.vec3f(-1, 0, 0);
    }
    const randomDir = randf.inHemisphere(normal);
    const toCenter = std.normalize(center.sub(newPos));

    direction = std.normalize(
      randomDir.mul(RANDOM_DIRECTION_WEIGHT).add(
        toCenter.mul(CENTER_BIAS_WEIGHT),
      ),
    );
  }
  if (newPos.y < 0 || newPos.y >= dimsf.y) {
    newPos.y = std.clamp(newPos.y, 0, dimsf.y - 1);
    let normal = d.vec3f(0, 1, 0);
    if (newPos.y > 1) {
      normal = d.vec3f(0, -1, 0);
    }
    const randomDir = randf.inHemisphere(normal);
    const toCenter = std.normalize(center.sub(newPos));
    direction = std.normalize(
      randomDir.mul(RANDOM_DIRECTION_WEIGHT).add(
        toCenter.mul(CENTER_BIAS_WEIGHT),
      ),
    );
  }
  if (newPos.z < 0 || newPos.z >= dimsf.z) {
    newPos.z = std.clamp(newPos.z, 0, dimsf.z - 1);
    let normal = d.vec3f(0, 0, 1);
    if (newPos.z > 1) {
      normal = d.vec3f(0, 0, -1);
    }
    const randomDir = randf.inHemisphere(normal);
    const toCenter = std.normalize(center.sub(newPos));
    direction = std.normalize(
      randomDir.mul(RANDOM_DIRECTION_WEIGHT).add(
        toCenter.mul(CENTER_BIAS_WEIGHT),
      ),
    );
  }

  agentsData.$[gid.x] = Agent({
    position: newPos,
    direction,
  });

  const oldState = std.textureLoad(computeLayout.$.oldState, d.vec3u(newPos)).x;
  const newState = oldState + 1;
  std.textureStore(
    computeLayout.$.newState,
    d.vec3u(newPos),
    d.vec4f(newState, 0, 0, 1),
  );
});

const blur = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: BLUR_WORKGROUP_SIZE,
})(({ gid }) => {
  const dims = std.textureDimensions(computeLayout.$.oldState);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) return;

  let sum = d.f32();
  let count = d.f32();

  for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const samplePos = d.vec3i(gid.xyz).add(
          d.vec3i(offsetX, offsetY, offsetZ),
        );
        const dimsi = d.vec3i(dims);

        if (
          samplePos.x >= 0 && samplePos.x < dimsi.x &&
          samplePos.y >= 0 && samplePos.y < dimsi.y &&
          samplePos.z >= 0 && samplePos.z < dimsi.z
        ) {
          const value =
            std.textureLoad(computeLayout.$.oldState, d.vec3u(samplePos)).x;
          sum = sum + value;
          count = count + 1;
        }
      }
    }
  }

  const blurred = sum / count;
  const newValue = std.saturate(blurred - params.$.evaporationRate);
  std.textureStore(
    computeLayout.$.newState,
    gid.xyz,
    d.vec4f(newValue, 0, 0, 1),
  );
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: uv[input.vertexIndex],
  };
});

const sampler = tgpu['~unstable'].sampler({
  magFilter: canFilter ? 'linear' : 'nearest',
  minFilter: canFilter ? 'linear' : 'nearest',
});

// Ray-box intersection
const rayBoxIntersection = (
  rayOrigin: d.v3f,
  rayDir: d.v3f,
  boxMin: d.v3f,
  boxMax: d.v3f,
) => {
  'use gpu';
  const invDir = d.vec3f(1).div(rayDir);
  const t0 = boxMin.sub(rayOrigin).mul(invDir);
  const t1 = boxMax.sub(rayOrigin).mul(invDir);
  const tmin = std.min(t0, t1);
  const tmax = std.max(t0, t1);
  const tNear = std.max(std.max(tmin.x, tmin.y), tmin.z);
  const tFar = std.min(std.min(tmax.x, tmax.y), tmax.z);
  const hit = tFar >= tNear && tFar >= 0;
  return RayBoxResult({ tNear, tFar, hit });
};

const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
  const ndcNear = d.vec4f(ndc, -1, 1);
  const ndcFar = d.vec4f(ndc, 1, 1);

  const worldNear = cameraData.$.invViewProj.mul(ndcNear);
  const worldFar = cameraData.$.invViewProj.mul(ndcFar);

  const rayOrigin = worldNear.xyz.div(worldNear.w);
  const rayEnd = worldFar.xyz.div(worldFar.w);
  const rayDir = std.normalize(rayEnd.sub(rayOrigin));

  const boxMin = d.vec3f();
  const boxMax = resolution;
  const isect = rayBoxIntersection(rayOrigin, rayDir, boxMin, boxMax);
  if (!isect.hit) {
    return d.vec4f();
  }

  // March params
  const tStart = std.max(isect.tNear, 0);
  const tEnd = isect.tFar;
  const numSteps = RAYMARCH_STEPS;
  const stepSize = (tEnd - tStart) / numSteps;

  const thresholdLo = d.f32(0.06);
  const thresholdHi = d.f32(0.25);
  const gamma = d.f32(1.4);
  const sigmaT = d.f32(DENSITY_MULTIPLIER);

  const albedo = d.vec3f(0.57, 0.44, 0.96);

  let transmittance = d.f32(1);
  let accum = d.vec3f();

  const TMin = d.f32(1e-3);

  for (let i = 0; i < numSteps; i++) {
    if (transmittance <= TMin) {
      break;
    }

    const t = tStart + (d.f32(i) + 0.5) * stepSize;
    const pos = rayOrigin.add(rayDir.mul(t));
    const texCoord = pos.div(resolution);

    const sampleValue = std
      .textureSampleLevel(renderLayout.$.state, sampler, texCoord, 0)
      .x;

    const d0 = std.smoothstep(thresholdLo, thresholdHi, sampleValue);
    const density = std.pow(d0, gamma);

    const alphaSrc = 1 - std.exp(-sigmaT * density * stepSize);

    const contrib = albedo.mul(alphaSrc);

    accum = accum.add(contrib.mul(transmittance));
    transmittance = transmittance * (1 - alphaSrc);
  }

  const alpha = 1 - transmittance;
  return d.vec4f(accum, alpha);
});

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentShader, { format: presentationFormat })
  .createPipeline();

const computePipeline = root['~unstable']
  .withCompute(updateAgents)
  .createPipeline();

const blurPipeline = root['~unstable']
  .withCompute(blur)
  .createPipeline();

const bindGroups = [0, 1].map((i) =>
  root.createBindGroup(computeLayout, {
    oldState: textures[i],
    newState: textures[1 - i],
  })
);

const renderBindGroups = [0, 1].map((i) =>
  root.createBindGroup(renderLayout, {
    state: textures[i],
  })
);

let lastTime = performance.now();
let currentTexture = 0;

function frame() {
  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  params.writePartial({ deltaTime });

  blurPipeline.with(computeLayout, bindGroups[currentTexture])
    .dispatchWorkgroups(
      Math.ceil(resolution.x / BLUR_WORKGROUP_SIZE[0]),
      Math.ceil(resolution.y / BLUR_WORKGROUP_SIZE[1]),
      Math.ceil(resolution.z / BLUR_WORKGROUP_SIZE[2]),
    );

  computePipeline.with(computeLayout, bindGroups[currentTexture])
    .dispatchWorkgroups(
      Math.ceil(NUM_AGENTS / AGENT_WORKGROUP_SIZE),
    );

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(
      renderLayout,
      renderBindGroups[1 - currentTexture],
    ).draw(3);

  root['~unstable'].flush();

  currentTexture = 1 - currentTexture;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// #region Example controls and cleanup

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const handleCameraRotation = (deltaX: number, deltaY: number) => {
  cameraTheta -= deltaX * 0.01;
  cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + deltaY * 0.01));
  updateCamera();
};

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;

  handleCameraRotation(deltaX, deltaY);

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
  isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cameraDistance *= 1 + e.deltaY * 0.001;
  cameraDistance = Math.max(
    100,
    Math.min(
      cameraDistance,
      Math.max(resolution.x, resolution.y, resolution.z) * 3,
    ),
  );
  updateCamera();
}, { passive: false });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDragging = true;
    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!isDragging || e.touches.length !== 1) return;

  const deltaX = e.touches[0].clientX - lastMouseX;
  const deltaY = e.touches[0].clientY - lastMouseY;

  handleCameraRotation(deltaX, deltaY);

  lastMouseX = e.touches[0].clientX;
  lastMouseY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  isDragging = false;
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
  e.preventDefault();
  isDragging = false;
}, { passive: false });

export const controls = {
  'Move Speed': {
    initial: DEFAULT_MOVE_SPEED,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (newValue: number) => {
      params.writePartial({ moveSpeed: newValue });
    },
  },
  'Sensor Angle': {
    initial: DEFAULT_SENSOR_ANGLE,
    min: 0,
    max: 3.14,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      params.writePartial({ sensorAngle: newValue });
    },
  },
  'Sensor Distance': {
    initial: DEFAULT_SENSOR_DISTANCE,
    min: 1,
    max: 50,
    step: 0.5,
    onSliderChange: (newValue: number) => {
      params.writePartial({ sensorDistance: newValue });
    },
  },
  'Turn Speed': {
    initial: DEFAULT_TURN_SPEED,
    min: 0,
    max: 100,
    step: 0.1,
    onSliderChange: (newValue: number) => {
      params.writePartial({ turnSpeed: newValue });
    },
  },
  'Evaporation Rate': {
    initial: DEFAULT_EVAPORATION_RATE,
    min: 0,
    max: 0.5,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      params.writePartial({ evaporationRate: newValue });
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
