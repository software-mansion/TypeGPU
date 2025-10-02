import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';
import * as m from 'wgpu-matrix';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const resolution = d.vec3f(124);

const Camera = d.struct({
  viewProj: d.mat4x4f,
  invViewProj: d.mat4x4f,
  position: d.vec3f,
});

const cameraPos = d.vec3f(
  resolution.x * 1.5,
  resolution.y * 1.5,
  resolution.z * 1.5,
);
const cameraTarget = d.vec3f(
  resolution.x / 2,
  resolution.y / 2,
  resolution.z / 2,
);
const cameraUp = d.vec3f(0, 1, 0);
const fov = (60 * Math.PI) / 180;
const aspect = canvas.width / canvas.height;
const near = 0.1;
const far = 1000.0;

const view = m.mat4.lookAt(cameraPos, cameraTarget, cameraUp, d.mat4x4f());
const proj = m.mat4.perspective(fov, aspect, near, far, d.mat4x4f());
const viewProj = m.mat4.mul(proj, view, d.mat4x4f());
const invViewProj = m.mat4.invert(viewProj, d.mat4x4f());

const cameraData = root.createUniform(Camera, {
  viewProj,
  invViewProj,
  position: cameraPos,
});

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

const NUM_AGENTS = 10_000;
const agentsData = root.createMutable(
  d.arrayOf(Agent, NUM_AGENTS),
  Array.from({ length: NUM_AGENTS }, () => {
    // Generate random point on sphere surface
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = Math.cbrt(Math.random()) *
      Math.min(resolution.x, resolution.y, resolution.z) / 4;

    const position = d.vec3f(
      Math.sin(phi) * Math.cos(theta) * radius + resolution.x / 2,
      Math.sin(phi) * Math.sin(theta) * radius + resolution.y / 2,
      Math.cos(phi) * radius + resolution.z / 2,
    );

    // Direction pointing toward center
    const center = d.vec3f(
      resolution.x / 2,
      resolution.y / 2,
      resolution.z / 2,
    );
    const direction = d.vec3f(
      center.x - position.x,
      center.y - position.y,
      center.z - position.z,
    );

    return Agent({
      position,
      direction,
    });
  }),
);

const params = root.createUniform(Params, {
  deltaTime: 0.016,
  moveSpeed: 30.0,
  sensorAngle: 0.5,
  sensorDistance: 9.0,
  turnSpeed: 2.0,
  evaporationRate: 0.05,
});

const textures = [0, 1].map((i) =>
  root['~unstable']
    .createTexture({
      size: [resolution.x, resolution.y, resolution.z],
      format: 'rgba8unorm',
      dimension: '3d',
    })
    .$usage('sampled', 'storage')
);

const computeLayout = tgpu.bindGroupLayout({
  oldState: { storageTexture: d.textureStorage3d('rgba8unorm', 'read-only') },
  newState: { storageTexture: d.textureStorage3d('rgba8unorm', 'write-only') },
});

const renderLayout = tgpu.bindGroupLayout({
  state: { texture: d.texture3d() },
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

// Helper to create perpendicular vectors for direction
const getPerpendicular = (dir: d.v3f) => {
  'kernel';
  let axis = d.vec3f(1, 0, 0);
  if (std.abs(dir.x) >= 0.9) {
    axis = d.vec3f(0, 1, 0);
  }
  return std.normalize(std.cross(dir, axis));
};

// Sample 8 points in a cone around the direction
const sense3D = (pos: d.v3f, direction: d.v3f) => {
  'kernel';
  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec3f(dims);

  let weightedDir = d.vec3f(0, 0, 0);
  let totalWeight = d.f32(0);

  // Get perpendicular vectors to form a basis
  const perp1 = getPerpendicular(direction);
  const perp2 = std.cross(direction, perp1);

  // Sample 8 directions in a cone
  const numSamples = 8;
  for (let i = 0; i < numSamples; i++) {
    const theta = (i / numSamples) * 2 * Math.PI;

    // Create direction in cone
    const coneOffset = perp1.mul(std.cos(theta)).add(perp2.mul(std.sin(theta)));
    const sensorDir = std.normalize(
      direction.add(coneOffset.mul(std.sin(params.$.sensorAngle))),
    );

    const sensorPos = pos.add(sensorDir.mul(params.$.sensorDistance));
    const sensorPosInt = d.vec3u(
      std.clamp(sensorPos, d.vec3f(0), dimsf.sub(d.vec3f(1))),
    );

    const color = std.textureLoad(computeLayout.$.oldState, sensorPosInt).xyz;
    const weight = color.x + color.y + color.z;

    weightedDir = weightedDir.add(sensorDir.mul(weight));
    totalWeight = totalWeight + weight;
  }

  return SenseResult({ weightedDir, totalWeight });
};

const updateAgents = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [64],
})(({ gid }) => {
  if (gid.x >= NUM_AGENTS) return;

  randf.seed(gid.x / NUM_AGENTS + 0.1);

  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec3f(dims);

  const agent = agentsData.$[gid.x];
  const random = randf.sample();

  // Normalize current direction
  let direction = std.normalize(agent.direction);

  // Sense the environment
  const senseResult = sense3D(agent.position, direction);

  // Adjust direction based on weighted sensing
  if (senseResult.totalWeight > 0.01) {
    const targetDir = std.normalize(senseResult.weightedDir);
    // Smoothly interpolate toward the sensed direction
    direction = std.normalize(
      direction.add(targetDir.mul(params.$.turnSpeed * params.$.deltaTime)),
    );
  } else {
    // Random walk when no signal
    const perp = getPerpendicular(direction);
    const randomOffset = perp.mul(
      (random * 2 - 1) * params.$.turnSpeed * params.$.deltaTime,
    );
    direction = std.normalize(direction.add(randomOffset));
  }

  // Move in the new direction
  const newPos = agent.position.add(
    direction.mul(params.$.moveSpeed * params.$.deltaTime),
  );

  // Bounce off boundaries
  if (newPos.x < 0 || newPos.x >= dimsf.x) {
    direction = d.vec3f(-direction.x, direction.y, direction.z);
    newPos.x = std.clamp(newPos.x, 0, dimsf.x - 1);
  }
  if (newPos.y < 0 || newPos.y >= dimsf.y) {
    direction = d.vec3f(direction.x, -direction.y, direction.z);
    newPos.y = std.clamp(newPos.y, 0, dimsf.y - 1);
  }
  if (newPos.z < 0 || newPos.z >= dimsf.z) {
    direction = d.vec3f(direction.x, direction.y, -direction.z);
    newPos.z = std.clamp(newPos.z, 0, dimsf.z - 1);
  }

  agentsData.$[gid.x] = Agent({
    position: newPos,
    direction,
  });

  const oldState =
    std.textureLoad(computeLayout.$.oldState, d.vec3u(newPos)).xyz;
  const newState = oldState.add(d.vec3f(1));
  std.textureStore(
    computeLayout.$.newState,
    d.vec3u(newPos),
    d.vec4f(newState, 1),
  );
});

const blur = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [4, 4, 4],
})(({ gid }) => {
  const dims = std.textureDimensions(computeLayout.$.oldState);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) return;

  let sum = d.vec3f();
  let count = d.f32();

  // 3x3x3 blur kernel
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
          const color =
            std.textureLoad(computeLayout.$.oldState, d.vec3u(samplePos)).xyz;
          sum = sum.add(color);
          count = count + 1;
        }
      }
    }
  }

  const blurred = sum.div(count);
  const newColor = std.clamp(
    blurred.sub(params.$.evaporationRate),
    d.vec3f(0),
    d.vec3f(1),
  );
  std.textureStore(
    computeLayout.$.newState,
    gid.xyz,
    d.vec4f(newColor, 1),
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

const filteringSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Ray-box intersection
const rayBoxIntersection = (
  rayOrigin: d.v3f,
  rayDir: d.v3f,
  boxMin: d.v3f,
  boxMax: d.v3f,
) => {
  'kernel';
  const invDir = d.vec3f(1.0).div(rayDir);
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
  // Convert UV to NDC
  const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);

  // Reconstruct ray from camera
  const ndcNear = d.vec4f(ndc, -1, 1);
  const ndcFar = d.vec4f(ndc, 1, 1);

  const worldNear = cameraData.$.invViewProj.mul(ndcNear);
  const worldFar = cameraData.$.invViewProj.mul(ndcFar);

  const rayOrigin = worldNear.xyz.div(worldNear.w);
  const rayEnd = worldFar.xyz.div(worldFar.w);
  const rayDir = std.normalize(rayEnd.sub(rayOrigin));

  // Volume bounding box
  const boxMin = d.vec3f(0, 0, 0);
  const boxMax = d.vec3f(resolution);

  const intersection = rayBoxIntersection(rayOrigin, rayDir, boxMin, boxMax);

  if (!intersection.hit) {
    return d.vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // Raymarch through volume
  const tStart = std.max(intersection.tNear, 0);
  const tEnd = intersection.tFar;
  const numSteps = 128;
  const stepSize = (tEnd - tStart) / numSteps;

  let color = d.vec3f(0, 0, 0);
  let alpha = d.f32(0);

  for (let i = 0; i < numSteps; i++) {
    if (alpha >= 0.99) break;

    const t = tStart + (i + 0.5) * stepSize;
    const pos = rayOrigin.add(rayDir.mul(t));

    // Convert to texture coordinates [0, 1]
    const texCoord = pos.div(resolution);

    // Sample the volume
    const sample = std.textureSampleLevel(
      renderLayout.$.state,
      filteringSampler,
      texCoord,
      0,
    ).xyz;

    // Get density
    const density = (sample.x + sample.y + sample.z) * 0.01;

    // Accumulate color with transparency
    const sampleAlpha = density * (1 - alpha);
    color = color.add(sample.mul(sampleAlpha * 0.5));
    alpha = alpha + sampleAlpha;
  }

  // Add some ambient lighting based on depth
  const bgColor = d.vec3f(0.05, 0.05, 0.08);
  color = color.add(bgColor.mul(1 - alpha));

  return d.vec4f(color, 1.0);
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
let iteration = 0;

function frame() {
  iteration++;
  const now = performance.now();
  const deltaTime = (now - lastTime) / 1000;
  lastTime = now;

  params.writePartial({ deltaTime });

  blurPipeline.with(computeLayout, bindGroups[currentTexture])
    .dispatchWorkgroups(
      Math.ceil(resolution.x / 4),
      Math.ceil(resolution.y / 4),
      Math.ceil(resolution.z / 4),
    );

  computePipeline.with(computeLayout, bindGroups[currentTexture])
    .dispatchWorkgroups(
      Math.ceil(NUM_AGENTS / 64),
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

export const controls = {
  'Move Speed': {
    initial: 30.0,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (newValue: number) => {
      params.writePartial({ moveSpeed: newValue });
    },
  },
  'Sensor Angle': {
    initial: 0.5,
    min: 0,
    max: Math.PI,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      params.writePartial({ sensorAngle: newValue });
    },
  },
  'Sensor Distance': {
    initial: 9.0,
    min: 1,
    max: 50,
    step: 0.5,
    onSliderChange: (newValue: number) => {
      params.writePartial({ sensorDistance: newValue });
    },
  },
  'Turn Speed': {
    initial: 2.0,
    min: 0,
    max: 10,
    step: 0.1,
    onSliderChange: (newValue: number) => {
      params.writePartial({ turnSpeed: newValue });
    },
  },
  'Evaporation Rate': {
    initial: 0.05,
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
