import { perlin3d, randf } from '@typegpu/noise';
import * as sdf from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { createBackgroundCubemap } from './background.ts';
import {
  GRID_SIZE,
  halton,
  LIGHT_COUNT,
  MAX_DIST,
  MAX_STEPS,
  SURF_DIST,
} from './constants.ts';
import { envMapLayout, lightsAccess, materialAccess, shade } from './pbr.ts';
import { createPostProcessingPipelines } from './post-processing.ts';
import {
  blendFactorAccess,
  getNormal,
  sceneSDF,
  sdfLayout,
  timeAccess,
} from './sdf-scene.ts';
import { Light, Material, Ray } from './types.ts';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const root = await tgpu.init();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const perlinCache = perlin3d.staticCache({
  root,
  size: d.vec3u(32, 32, 32),
});

const [width, height] = [canvas.width / 1.4, canvas.height / 1.4];

const cameraUniform = root.createUniform(Camera);
const timeUniform = root.createUniform(d.f32);
const jitterUniform = root.createUniform(d.vec2f);

const initialMaterial = {
  albedo: d.vec3f(0.98),
  metallic: 0.92,
  roughness: 0.09,
  ao: 0.3,
};
const materialUniform = root.createUniform(Material, initialMaterial);

const lightsUniform = root.createUniform(d.arrayOf(Light, LIGHT_COUNT), [
  Light({ position: d.vec3f(3, 2, 0), color: d.vec3f(1, 0.5, 0.9).mul(45) }),
  Light({ position: d.vec3f(-3, 2, -1), color: d.vec3f(0.2, 0.85, 1).mul(40) }),
]);

const initialBloom = {
  threshold: 0.18,
  intensity: 1.3,
};
const blendFactorUniform = root.createUniform(d.f32, 0.03);

const sdfTexture = root['~unstable']
  .createTexture({
    size: [GRID_SIZE / 2, GRID_SIZE / 2, GRID_SIZE / 2],
    format: 'rgba16float',
    dimension: '3d',
  })
  .$usage('sampled', 'storage');

const sdfWriteView = sdfTexture.createView(d.textureStorage3d('rgba16float'));

const sdfBindGroup = root.createBindGroup(sdfLayout, {
  sdfTexture: sdfTexture,
  sdfSampler: root['~unstable'].createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  }),
});

const pointOffsets = tgpu.const(
  d.arrayOf(d.f32, 11),
  [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
);

const extendedRippleUniform = root.createUniform(d.u32);
const sdfPrecalcPipeline = root
  .with(timeAccess, timeUniform)
  .with(blendFactorAccess, blendFactorUniform)
  .createGuardedComputePipeline((x, y, z) => {
    'use gpu';
    const cellSize = 1 / GRID_SIZE;
    const p = d.vec3f(x, y, z).add(0.5).mul(cellSize);

    const r = timeAccess.$ * 0.15;

    const iterCount = std.select(5, 11, extendedRippleUniform.$ === 1);

    let shellD = d.f32(1e10);
    for (let ix = 0; ix < iterCount; ix++) {
      for (let iy = 0; iy < iterCount; iy++) {
        for (let iz = 0; iz < iterCount; iz++) {
          const ox = pointOffsets.$[ix];
          const oy = pointOffsets.$[iy];
          const oz = pointOffsets.$[iz];

          const qx = std.select(ox + p.x, ox - p.x, ix % 2 === 0);
          const qy = std.select(oy + p.y, oy - p.y, iy % 2 === 0);
          const qz = std.select(oz + p.z, oz - p.z, iz % 2 === 0);

          const q = d.vec3f(qx, qy, qz);
          shellD = sdf.opSmoothUnion(
            shellD,
            std.abs(std.length(q) - r) - 0.005,
            blendFactorAccess.$,
          );
        }
      }
    }

    std.textureStore(
      sdfWriteView.$,
      d.vec3u(x, y, z),
      d.vec4f(shellD, 0, 0, 1),
    );
  });

const backgroundCubemap = createBackgroundCubemap(root);

const envMapBindGroup = root.createBindGroup(envMapLayout, {
  envMap: backgroundCubemap.view,
  envSampler: root['~unstable'].createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  }),
});

const postProcessing = createPostProcessingPipelines(
  root,
  width,
  height,
  initialBloom,
);

const cameraResult = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(2, 2, 2, 1), maxZoom: 4, minZoom: 1 },
  (newProps) => cameraUniform.writePartial(newProps),
);

const getRayForUV = (uv: d.v2f) => {
  'use gpu';
  const camera = cameraUniform.$;
  const jitteredUV = uv.add(jitterUniform.$);
  const ndc = jitteredUV.mul(2).sub(1).mul(d.vec2f(1, -1));
  const farView = camera.projectionInverse.mul(d.vec4f(ndc.xy, 1, 1));
  const farWorld = camera.viewInverse.mul(
    d.vec4f(farView.xyz.div(farView.w), 1),
  );
  const direction = std.normalize(farWorld.xyz.sub(camera.position.xyz));
  return Ray({ origin: camera.position, direction: d.vec4f(direction, 0) });
};

const rayMarchPipeline = root
  .pipe(perlinCache.inject())
  .with(materialAccess, materialUniform)
  .with(lightsAccess, lightsUniform)
  .createGuardedComputePipeline((x, y) => {
    'use gpu';
    randf.seed2(d.vec2f(d.f32(x), d.f32(y)).add(timeUniform.$));
    const textureSize = std.textureDimensions(
      postProcessing.result.writeView.$,
    );
    const uv = d.vec2f(x, y).add(0.5).div(d.vec2f(textureSize));
    const ray = getRayForUV(uv);

    const ro = ray.origin.xyz;
    const rd = ray.direction.xyz;

    let totalDist = d.f32(0);
    let lastDist = d.f32(MAX_DIST);
    let hit = d.bool(false);

    for (let i = 0; i < MAX_STEPS; i++) {
      const p = ro.add(rd.mul(totalDist));
      lastDist = sceneSDF(p);

      if (lastDist < SURF_DIST) {
        hit = true;
        break;
      }
      if (totalDist > MAX_DIST) {
        break;
      }

      totalDist += lastDist;
    }

    if (lastDist < SURF_DIST * 20 && totalDist < MAX_DIST) {
      hit = true;
    }

    let finalColor = std.textureSampleLevel(
      envMapLayout.$.envMap,
      envMapLayout.$.envSampler,
      rd,
      0,
    ).rgb;

    if (hit) {
      const p = ro.add(rd.mul(totalDist));
      const n = getNormal(p);
      const v = std.normalize(ro.sub(p));
      const sceneColor = shade(p, n, v);

      const fog = std.exp(-totalDist * 0.05);
      const fogColor = d.vec3f(0.02, 0.02, 0.04);
      finalColor = std.mix(fogColor, sceneColor, fog);
    }

    std.textureStore(
      postProcessing.result.writeView.$,
      d.vec2u(x, y),
      d.vec4f(finalColor, 1),
    );
  });

let animationFrame: number;
let frameIndex = 0;
let timeScale = 0.5;
let accumulatedTime = 0;
let lastTimestamp = 0;
let isExtendedRipplesEnabled = false;

function run(timestamp: number) {
  const deltaTime = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  const maxTime = isExtendedRipplesEnabled ? 62 : 28;
  accumulatedTime = Math.min(
    maxTime,
    Math.max(0, accumulatedTime + deltaTime * timeScale),
  );
  timeUniform.write(accumulatedTime);

  const jitterX = (halton(frameIndex % 16, 2) - 0.5) / width;
  const jitterY = (halton(frameIndex % 16, 3) - 0.5) / height;
  jitterUniform.write(d.vec2f(jitterX, jitterY));
  frameIndex++;

  sdfPrecalcPipeline.dispatchThreads(
    GRID_SIZE / 2,
    GRID_SIZE / 2,
    GRID_SIZE / 2,
  );

  rayMarchPipeline
    .with(envMapBindGroup)
    .with(sdfBindGroup)
    .dispatchThreads(width, height);

  postProcessing.runTaa();

  postProcessing.runBloom();

  postProcessing.render(context);

  animationFrame = requestAnimationFrame(run);
}

animationFrame = requestAnimationFrame(run);

export const controls = defineControls({
  metallic: {
    min: 0,
    max: 1,
    initial: initialMaterial.metallic,
    step: 0.01,
    onSliderChange(v: number) {
      materialUniform.writePartial({ metallic: v });
    },
  },
  roughness: {
    min: 0.01,
    max: 1,
    initial: initialMaterial.roughness,
    step: 0.01,
    onSliderChange(v: number) {
      materialUniform.writePartial({ roughness: v });
    },
  },
  'ambient occlusion': {
    min: 0,
    max: 1,
    initial: initialMaterial.ao,
    step: 0.01,
    onSliderChange(v: number) {
      materialUniform.writePartial({ ao: v });
    },
  },
  'bloom threshold': {
    min: 0,
    max: 1,
    initial: initialBloom.threshold,
    step: 0.01,
    onSliderChange(v: number) {
      postProcessing.bloomUniform.writePartial({ threshold: v });
    },
  },
  'bloom intensity': {
    min: 0,
    max: 2,
    initial: initialBloom.intensity,
    step: 0.01,
    onSliderChange(v: number) {
      postProcessing.bloomUniform.writePartial({ intensity: v });
    },
  },
  'blend factor': {
    min: 0.00001,
    max: 0.5,
    step: 0.00001,
    initial: 0.03,
    onSliderChange(v: number) {
      blendFactorUniform.write(v);
    },
  },
  time: {
    min: -5,
    max: 5,
    initial: 0.5,
    step: 0.01,
    onSliderChange(v: number) {
      timeScale = v;
    },
  },
  'additional ripples': {
    initial: false,
    onToggleChange(val) {
      isExtendedRipplesEnabled = val;
      extendedRippleUniform.write(val ? 1 : 0);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  cameraResult.cleanupCamera();
  root.destroy();
}
