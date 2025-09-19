import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';
import { randf } from '@typegpu/noise';
import { Slider } from './slider.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const slider = new Slider(root, [-1.2, 0], [1, 0], 20);
const sliderStorage = slider.pointsBuffer.as('readonly');

const [width, height] = [canvas.width, canvas.height];
const rayMarchTexture = root['~unstable'].createTexture({
  size: [width, height],
  format: 'rgba8unorm',
}).$usage('storage', 'sampled');
const rayMarchWrite = rayMarchTexture.createView(
  d.textureStorage2d('rgba8unorm'),
);
const rayMarchSampled = rayMarchTexture.createView();

const filteringSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const Camera = d.struct({
  position: d.vec3f,
  focus: d.vec3f,
  up: d.vec3f,
  fov: d.f32,
});
const cameraUniform = root.createUniform(Camera, {
  position: d.vec3f(0.024, 2.7, 1.9),
  focus: d.vec3f(0, 0, 0),
  up: d.vec3f(0, 1, 0),
  fov: Math.PI / 4,
});

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});
const lightUniform = root.createUniform(DirectionalLight, {
  direction: std.normalize(d.vec3f(0.19, -0.24, 0.75)),
  color: d.vec3f(1, 1, 1),
});

const AMBIENT_COLOR = d.vec3f(1);
const AMBIENT_INTENSITY = 0.5;
const SPECULAR_POWER = 32.0;
const SPECULAR_INTENSITY = 0.4;

const MAX_STEPS = 100;
const MAX_DIST = 10;
const SURF_DIST = 0.001;

const AO_STEPS = 5;
const AO_RADIUS = 0.08;
const AO_INTENSITY = 1;
const AO_BIAS = SURF_DIST * 4.0;

const getSceneDist = (position: d.v3f) => {
  'kernel';
  const mainScene = sdf.opSmoothDifference(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0),
    sdf.opExtrudeY(
      position,
      sdf.sdRoundedBox2d(
        position.xz,
        d.vec2f(1, 0.2),
        0.2,
      ),
      0.06,
    ),
    0.01,
  );
  let rest = d.f32(MAX_DIST);
  for (let i = 1; i < sliderStorage.$.length; i++) {
    const point1 = sliderStorage.$[i - 1];
    const point2 = sliderStorage.$[i];
    const lineDist2d = sdf.sdLine(
      position.xy.add(d.vec2f(0, 0.1)),
      point1,
      point2,
    );
    const extrudedLine = sdf.opExtrudeZ(position, lineDist2d, 0.16);
    rest = sdf.opSmoothUnion(rest, extrudedLine, 0.18);
  }
  return sdf.opUnion(mainScene, rest);
};

const getNormal = (position: d.v3f) => {
  'kernel';
  const epsilon = 0.0001;
  const xOffset = d.vec3f(epsilon, 0, 0);
  const yOffset = d.vec3f(0, epsilon, 0);
  const zOffset = d.vec3f(0, 0, epsilon);
  const normalX = getSceneDist(std.add(position, xOffset)) -
    getSceneDist(std.sub(position, xOffset));
  const normalY = getSceneDist(std.add(position, yOffset)) -
    getSceneDist(std.sub(position, yOffset));
  const normalZ = getSceneDist(std.add(position, zOffset)) -
    getSceneDist(std.sub(position, zOffset));
  return std.normalize(d.vec3f(normalX, normalY, normalZ));
};

const calculateAO = (position: d.v3f, normal: d.v3f) => {
  'kernel';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * i;
    const samplePosition = std.add(position, std.mul(normal, sampleHeight));
    // Bias avoids treating the surface itself as an occluder.
    const distanceToSurface = getSceneDist(samplePosition) - AO_BIAS;
    // Only count if the surface intrudes into the test sphere.
    const occlusionContribution = std.max(
      0.0,
      sampleHeight - distanceToSurface,
    );
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5; // slightly favor near-field occlusion
    // Early out if we're already very dark.
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) break;
  }

  // Map accumulated intrusion to [0,1] visibility.
  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.min(1.0, std.max(0.0, rawAO));
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'kernel';
  let distanceFromOrigin = d.f32();

  for (let i = 0; i < MAX_STEPS; i++) {
    const currentPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );
    const distanceToSurface = getSceneDist(currentPosition);
    distanceFromOrigin += distanceToSurface;

    if (distanceFromOrigin > MAX_DIST || distanceToSurface < SURF_DIST) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    const hitPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );
    const normal = getNormal(hitPosition);

    const lightDir = std.mul(lightUniform.$.direction, -1.0);
    const diffuse = std.max(std.dot(normal, lightDir), 0.0);

    // Calculate specular reflection
    const viewDir = std.normalize(std.sub(rayOrigin, hitPosition));
    const reflectDir = std.reflect(std.mul(lightDir, -1.0), normal);
    const specularFactor = std.pow(
      std.max(std.dot(viewDir, reflectDir), 0.0),
      SPECULAR_POWER,
    );
    const specular = std.mul(
      std.mul(lightUniform.$.color, specularFactor),
      SPECULAR_INTENSITY,
    );

    const baseColor = d.vec3f(0.9, 0.9, 0.9);
    const directionalLight = std.mul(
      std.mul(baseColor, lightUniform.$.color),
      diffuse,
    );

    const ambientLight = std.mul(
      std.mul(baseColor, AMBIENT_COLOR),
      AMBIENT_INTENSITY,
    );
    const litColor = std.add(std.add(directionalLight, ambientLight), specular);

    const ao = calculateAO(hitPosition, normal);
    const finalColor = std.mul(litColor, ao);

    return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1.0);
  }
  return d.vec4f();
};

const raymarchFn = tgpu['~unstable'].computeFn({
  workgroupSize: [16, 16],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})(({ gid }) => {
  randf.seed2(d.vec2f(gid.xy).div(d.vec2f(width, height)));
  const rayOrigin = cameraUniform.$.position;

  const u = (gid.x / width) * 2.0 - 1.0;
  const v = 1.0 - (gid.y / height) * 2.0;

  const forward = std.normalize(
    std.sub(cameraUniform.$.focus, cameraUniform.$.position),
  );
  const right = std.normalize(std.cross(forward, cameraUniform.$.up));
  const up = std.cross(right, forward);

  // Calculate perspective projection
  const aspectRatio = width / height;
  const tanHalfFov = std.tan(cameraUniform.$.fov / 2.0);

  const offsetRight = std.mul(right, u * aspectRatio * tanHalfFov);
  const offsetUp = std.mul(up, v * tanHalfFov);

  const rayDir = std.normalize(
    std.add(std.add(forward, offsetRight), offsetUp),
  );

  const color = rayMarch(rayOrigin, rayDir);

  std.textureStore(rayMarchWrite.$, d.vec2u(gid.x, gid.y), color);
});

const computePipeline = root['~unstable']
  .withCompute(raymarchFn)
  .createPipeline().withPerformanceCallback((s, e) => {
    console.log(`${Number(e - s) / 1_000_000} ms`);
  });

// Simple fullscreen vertex shader
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

// Fragment shader to display the texture
const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(rayMarchSampled.$, filteringSampler, input.uv);
});

let mouseX = 1.0;
let targetMouseX = 1.0;
let isMouseDown = false;
const mouseSmoothing = 0.08; // Lower = smoother, higher = more responsive

canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
});

canvas.addEventListener('mouseleave', () => {
  isMouseDown = false;
});

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  // Convert mouse X to world coordinates (-1 to 1)
  targetMouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isMouseDown) return;
  const rect = canvas.getBoundingClientRect();
  // Convert mouse X to world coordinates (-1 to 1)
  targetMouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
});

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let lastTimeStamp = performance.now();
function render(timestamp: number) {
  const deltaTime = (timestamp - lastTimeStamp) * 0.001;
  lastTimeStamp = timestamp;

  // Smooth mouse interpolation
  if (isMouseDown) {
    mouseX += (targetMouseX - mouseX) * mouseSmoothing;
  } else {
    // Gradually return to rest position when not dragging
    mouseX += (1.0 - mouseX) * mouseSmoothing * 0.5;
  }
  slider.setDragX(mouseX);

  slider.update(deltaTime);

  computePipeline.dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// #region Example controls and cleanup

export const controls = {
  'Light dir': {
    initial: d.vec3f(0.19, -0.24, 0.75),
    min: d.vec3f(-1, -1, -1),
    max: d.vec3f(1, 1, 1),
    step: d.vec3f(0.01, 0.01, 0.01),
    onVectorSliderChange: (v: [number, number, number]) => {
      lightUniform.writePartial({
        direction: std.normalize(d.vec3f(...v)),
      });
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
