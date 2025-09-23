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

const slider = new Slider(root, d.vec2f(-1.2, 0), d.vec2f(1, 0), 26);
const sliderStorage = slider.pointsBuffer.as('readonly');
const normalsStorage = slider.normalsBuffer.as('readonly');
const anglesStorage = slider.anglesBuffer.as('readonly');

const [width, height] = [canvas.width * 0.8, canvas.height * 0.8];
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

const HitInfo = d.struct({
  distance: d.f32,
  objectType: d.i32,
});

const AMBIENT_COLOR = d.vec3f(1);
const AMBIENT_INTENSITY = 0.5;
const SPECULAR_POWER = 32.0;
const SPECULAR_INTENSITY = 0.4;

const MAX_STEPS = 100;
const MAX_DIST = 10;
const SURF_DIST = 0.001;

const JELLY_IOR = 1.42;
const JELLY_ABSORB = d.vec3f(1.6, 3.2, 6.0).mul(15);
const JELLY_SCATTER_TINT = d.vec3f(1.0, 0.5, 0.15);
const JELLY_SCATTER_STRENGTH = 0.7;
const MAX_INTERNAL_STEPS = 20;
const JELLY_EDGE_BLEND = 0.02;

const AO_STEPS = 4;
const AO_RADIUS = 0.14;
const AO_INTENSITY = 1;
const AO_BIAS = SURF_DIST * 4.0;

const LINE_RADIUS = 0.024;
const LINE_HALF_THICK = 0.18;
const LINE_Y_OFFSET = 0.04;

const segW = tgpu['~unstable'].privateVar(d.vec2f);
const segIdx = tgpu['~unstable'].privateVar(d.vec2i);

const sdInflatedPolyline2D = (p: d.v2f) => {
  'kernel';
  let dmin = d.f32(1e9);
  let bestI = d.i32(-1);
  let bestT = d.f32(0.0);

  for (let i = 1; i < sliderStorage.$.length; i++) {
    const a = sliderStorage.$[i - 1];
    const b = sliderStorage.$[i];
    const anglesA = anglesStorage.$[i - 1];
    const anglesB = anglesStorage.$[i];

    const ab = std.sub(b, a);
    const ap = std.sub(p, a);
    const extensionA = std.tan(anglesA.y - Math.PI / 2) * LINE_RADIUS;
    const extensionB = std.tan(anglesB.x - Math.PI / 2) * LINE_RADIUS;
    const abLen = std.length(ab);
    const extendedLen = abLen + extensionA + extensionB;
    const t = (std.dot(ap, ab) / abLen + extensionA) / extendedLen;

    const segUnsigned = sdf.sdLine(p, a, b);
    const seg = segUnsigned - LINE_RADIUS;
    if (seg < dmin) {
      dmin = seg;
      bestI = i;
      bestT = t;
    }
  }

  segIdx.$ = d.vec2i(bestI - 1, bestI);
  segW.$ = d.vec2f(1.0 - bestT, bestT);

  return dmin;
};

const sliderSdf3D = (position: d.v3f) => {
  'kernel';
  const p2 = std.add(position.xy, d.vec2f(0.0, LINE_Y_OFFSET));
  const poly2D = sdInflatedPolyline2D(p2);
  return sdf.opExtrudeZ(position, poly2D, LINE_HALF_THICK);
};

const getMainSceneDist = (position: d.v3f) => {
  'kernel';
  return sdf.opSmoothDifference(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0),
    sdf.opExtrudeY(
      position,
      sdf.sdRoundedBox2d(position.xz, d.vec2f(1, 0.2), 0.2),
      0.06,
    ),
    0.01,
  );
};

const getSceneDist = (position: d.v3f) => {
  'kernel';
  const mainScene = getMainSceneDist(position);
  const poly3D = sliderSdf3D(position);

  const hitInfo = HitInfo();

  if (poly3D < mainScene) {
    hitInfo.distance = poly3D;
    hitInfo.objectType = 1; // Slider
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = 2; // Main scene
  }
  return hitInfo;
};

const getNormal = (position: d.v3f) => {
  'kernel';
  const epsilon = 0.0001;
  const xOffset = d.vec3f(epsilon, 0, 0);
  const yOffset = d.vec3f(0, epsilon, 0);
  const zOffset = d.vec3f(0, 0, epsilon);
  const normalX = getSceneDist(std.add(position, xOffset)).distance -
    getSceneDist(std.sub(position, xOffset)).distance;
  const normalY = getSceneDist(std.add(position, yOffset)).distance -
    getSceneDist(std.sub(position, yOffset)).distance;
  const normalZ = getSceneDist(std.add(position, zOffset)).distance -
    getSceneDist(std.sub(position, zOffset)).distance;
  return std.normalize(d.vec3f(normalX, normalY, normalZ));
};

const getNormalMain = (position: d.v3f) => {
  'kernel';
  const epsilon = 0.0001;
  const xOffset = d.vec3f(epsilon, 0, 0);
  const yOffset = d.vec3f(0, epsilon, 0);
  const zOffset = d.vec3f(0, 0, epsilon);
  const normalX = getMainSceneDist(std.add(position, xOffset)) -
    getMainSceneDist(std.sub(position, xOffset));
  const normalY = getMainSceneDist(std.add(position, yOffset)) -
    getMainSceneDist(std.sub(position, yOffset));
  const normalZ = getMainSceneDist(std.add(position, zOffset)) -
    getMainSceneDist(std.sub(position, zOffset));
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
    const distanceToSurface = getSceneDist(samplePosition).distance - AO_BIAS;
    const occlusionContribution = std.max(
      0.0,
      sampleHeight - distanceToSurface,
    );
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.min(1.0, std.max(0.0, rawAO));
};

const fresnelSchlick = (cosTheta: number, ior1: number, ior2: number) => {
  'kernel';
  const r0 = std.pow((ior1 - ior2) / (ior1 + ior2), 2.0);
  return r0 + (1.0 - r0) * std.pow(1.0 - cosTheta, 5.0);
};

const beerLambert = (sigma: d.v3f, dist: number) => {
  'kernel';
  return d.vec3f(
    std.exp(-sigma.x * dist),
    std.exp(-sigma.y * dist),
    std.exp(-sigma.z * dist),
  );
};

// Interpolated curve normal blended toward ±Z near extruded edges.
const getJellyNormal = (position: d.v3f) => {
  'kernel';
  const p2 = std.add(position.xy, d.vec2f(0.0, LINE_Y_OFFSET));

  // Evaluate 2D SDF here to lock segIdx/segW for this position
  const d2 = sdInflatedPolyline2D(p2);

  // Interpolated curve normal (smoothed "fake curve" normal)
  let n2 = normalsStorage.$[segIdx.$.x]
    .mul(segW.$.x)
    .add(normalsStorage.$[segIdx.$.y].mul(segW.$.y));
  n2 = std.normalize(n2);

  // Orient to outward gradient to avoid flipping artifacts
  const eps = 0.0005;
  const gx = sdInflatedPolyline2D(std.add(p2, d.vec2f(eps, 0.0))) -
    sdInflatedPolyline2D(std.sub(p2, d.vec2f(eps, 0.0)));
  const gy = sdInflatedPolyline2D(std.add(p2, d.vec2f(0.0, eps))) -
    sdInflatedPolyline2D(std.sub(p2, d.vec2f(0.0, eps)));
  const grad2 = std.normalize(d.vec2f(gx, gy));
  if (std.dot(grad2, n2) < 0.0) {
    n2 = std.mul(n2, -1.0);
  }
  const Nxy = std.normalize(d.vec3f(n2, 0.0));

  // Blend weights: close to 2D boundary => Nxy, close to Z side => ±Z
  const dz = std.abs(std.abs(position.z) - LINE_HALF_THICK);
  const wZ = std.min(1.0, std.max(0.0, 1.0 - dz / JELLY_EDGE_BLEND));
  const wXY = std.min(1.0, std.max(0.0, 1.0 - std.abs(d2) / JELLY_EDGE_BLEND));
  const Nz = d.vec3f(0.0, 0.0, std.sign(position.z) * 1.0);

  const Nmix = std.add(std.mul(Nxy, wXY), std.mul(Nz, wZ));
  return std.normalize(Nmix);
};

// One-hop ray march that ignores the slider
const rayMarchNoJelly = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'kernel';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(rayOrigin, std.mul(rayDirection, distanceFromOrigin));
    hit = getMainSceneDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST) break;
  }

  if (distanceFromOrigin < MAX_DIST) {
    const pos = std.add(rayOrigin, std.mul(rayDirection, distanceFromOrigin));
    const n = getNormalMain(pos);

    const lightDir = std.mul(lightUniform.$.direction, -1.0);
    const diffuse = std.max(std.dot(n, lightDir), 0.0);
    const viewDir = std.normalize(std.sub(rayOrigin, pos));
    const reflectDir = std.reflect(std.mul(lightDir, -1.0), n);
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
    const lit = std.add(std.add(directionalLight, ambientLight), specular);
    const ao = calculateAO(pos, n);
    return std.mul(lit, ao);
  }
  return d.vec3f(0.0, 0.0, 0.0);
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'kernel';
  let distanceFromOrigin = d.f32();
  let hitInfo = HitInfo();

  for (let i = 0; i < MAX_STEPS; i++) {
    const currentPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );
    hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;

    if (distanceFromOrigin > MAX_DIST || hitInfo.distance < SURF_DIST) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    const hitPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );
    let normal = getNormal(hitPosition);
    if (hitInfo.objectType === 1) {
      normal = getJellyNormal(hitPosition);
    }

    const lightDir = std.mul(lightUniform.$.direction, -1.0);
    const diffuse = std.max(std.dot(normal, lightDir), 0.0);

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

    if (hitInfo.objectType === 1) {
      const originalSegment = segIdx.$.x;
      const originalT = segW.$.x;

      const N = getJellyNormal(hitPosition);
      const I = rayDirection;
      const cosi = std.min(
        1.0,
        std.max(0.0, std.dot(std.mul(I, -1.0), N)),
      );
      const F = fresnelSchlick(cosi, 1.0, JELLY_IOR);

      // Reflection
      const reflDir = std.reflect(I, N);
      const reflOrigin = std.add(hitPosition, std.mul(N, SURF_DIST * 2.0));
      const reflection = rayMarchNoJelly(reflOrigin, reflDir);

      // Refraction
      const eta = 1.0 / JELLY_IOR;
      const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let refractedColor = d.vec3f(0.0, 0.0, 0.0);
      if (k > 0.0) {
        const refrDir = std.normalize(
          std.add(
            std.mul(I, eta),
            std.mul(N, eta * cosi - std.sqrt(k)),
          ),
        );
        // March inside jelly to exit
        let p = std.add(hitPosition, std.mul(refrDir, SURF_DIST * 2.0));
        let insideLen = d.f32();
        for (let i = 0; i < MAX_INTERNAL_STEPS; i++) {
          const dIn = sliderSdf3D(p); // negative inside, ~0 at boundary
          const step = std.max(SURF_DIST, std.abs(dIn));
          p = std.add(p, std.mul(refrDir, step));
          insideLen += step;
          if (dIn >= 0.0) break; // exited
        }
        const exitPos = std.add(p, std.mul(refrDir, SURF_DIST * 2.0));
        const env = rayMarchNoJelly(exitPos, refrDir);
        const T = beerLambert(
          JELLY_ABSORB.mul(
            std.min(
              1.0,
              std.pow(
                (originalSegment + 1 - originalT) / sliderStorage.$.length,
                3,
              ),
            ),
          ),
          insideLen,
        );
        // Subtle forward-scatter glow
        const forward = std.max(0.0, std.dot(lightDir, refrDir));
        const scatter = std.mul(
          JELLY_SCATTER_TINT,
          JELLY_SCATTER_STRENGTH * forward,
        );
        refractedColor = std.add(std.mul(env, T), scatter);
      }

      const jelly = std.add(
        std.mul(reflection, F),
        std.mul(refractedColor, 1.0 - F),
      );
      return d.vec4f(jelly, 1.0);
    }

    const ao = calculateAO(hitPosition, normal);
    const finalColor = std.mul(litColor, ao);

    return d.vec4f(finalColor, 1.0);
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

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(rayMarchSampled.$, filteringSampler, input.uv);
});

let mouseX = 1.0;
let targetMouseX = 1.0;
let isMouseDown = false;
const mouseSmoothing = 0.08;

canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
});

canvas.addEventListener('mouseleave', () => {
  isMouseDown = false;
});

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const normalizedX = (e.clientX - rect.left) / rect.width;
  const clampedX = Math.max(0.45, Math.min(0.9, normalizedX));
  targetMouseX = ((clampedX - 0.4) / (0.9 - 0.4)) * (1.0 - (-0.7)) + (-0.5);
});

canvas.addEventListener('mousemove', (e) => {
  if (!isMouseDown) return;
  const rect = canvas.getBoundingClientRect();
  const normalizedX = (e.clientX - rect.left) / rect.width;
  const clampedX = Math.max(0.45, Math.min(0.9, normalizedX));
  targetMouseX = ((clampedX - 0.4) / (0.9 - 0.4)) * (1.0 - (-0.7)) + (-0.5);
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  isMouseDown = true;
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const normalizedX = (touch.clientX - rect.left) / rect.width;
  const clampedX = Math.max(0.45, Math.min(0.9, normalizedX));
  targetMouseX = ((clampedX - 0.4) / (0.9 - 0.4)) * (1.0 - (-0.7)) + (-0.5);
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!isMouseDown) return;
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const normalizedX = (touch.clientX - rect.left) / rect.width;
  const clampedX = Math.max(0.45, Math.min(0.9, normalizedX));
  targetMouseX = ((clampedX - 0.4) / (0.9 - 0.4)) * (1.0 - (-0.7)) + (-0.5);
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  isMouseDown = false;
});

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let lastTimeStamp = performance.now();
function render(timestamp: number) {
  const deltaTime = (timestamp - lastTimeStamp) * 0.001;
  lastTimeStamp = timestamp;

  if (isMouseDown) {
    mouseX += (targetMouseX - mouseX) * mouseSmoothing;
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
