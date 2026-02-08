import { perlin3d, randf } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { createBackgroundCubemap } from './background.ts';
import {
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
  timeAccess,
} from './sdf-scene.ts';
import { BloomParams, Light, Material, Ray } from './types.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const root = await tgpu.init();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const perlinCache = perlin3d.staticCache({
  root,
  size: d.vec3u(64, 64, 64),
});

const [width, height] = [canvas.width / 2, canvas.height / 2];

const cameraUniform = root.createUniform(Camera);
const timeUniform = root.createUniform(d.f32);
const jitterUniform = root.createUniform(d.vec2f);

const initialMaterial = {
  albedo: d.vec3f(0.98),
  metallic: 0.8,
  roughness: 0.5,
  ao: 0.4,
};
const materialUniform = root.createUniform(Material, initialMaterial);

const lightsUniform = root.createUniform(d.arrayOf(Light, LIGHT_COUNT), [
  Light({ position: d.vec3f(3, 2, 0), color: d.vec3f(1, 0.5, 0.9).mul(45) }),
  Light({ position: d.vec3f(-3, 2, -1), color: d.vec3f(0.2, 0.85, 1).mul(40) }),
]);

const initialBloom = {
  threshold: 0.5,
  intensity: 0.6,
};
const bloomUniform = root.createUniform(BloomParams, initialBloom);
const blendFactorUniform = root.createUniform(d.f32, 0.02);

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
  bloomUniform,
  presentationFormat,
);

const cameraResult = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(2, 2, 2, 1) },
  (newProps) => cameraUniform.writePartial(newProps),
);

const getRayForUV = (uv: d.v2f) => {
  'use gpu';
  const camera = cameraUniform.$;
  const jitteredUV = uv.add(jitterUniform.$);
  const ndc = jitteredUV.mul(2).sub(1).mul(d.vec2f(1, -1));
  const farView = camera.inverseProjection.mul(d.vec4f(ndc.xy, 1, 1));
  const farWorld = camera.inverseView.mul(
    d.vec4f(farView.xyz.div(farView.w), 1),
  );
  const direction = std.normalize(farWorld.xyz.sub(camera.position.xyz));
  return Ray({ origin: camera.position, direction: d.vec4f(direction, 0) });
};

const rayMarchPipeline = root['~unstable']
  .pipe(perlinCache.inject())
  .with(timeAccess, timeUniform)
  .with(blendFactorAccess, blendFactorUniform)
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
    let hit = d.bool(false);

    for (let i = 0; i < MAX_STEPS; i++) {
      const p = ro.add(rd.mul(totalDist));
      const dist = sceneSDF(p);

      if (dist < SURF_DIST) {
        hit = true;
        break;
      }
      if (totalDist > MAX_DIST) {
        break;
      }

      totalDist += dist;
    }

    let finalColor = std.textureSampleLevel(
      envMapLayout.$.envMap,
      envMapLayout.$.envSampler,
      rd,
      0,
    ).xyz;

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

function run(timestamp: number) {
  const deltaTime = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  accumulatedTime += deltaTime * timeScale;
  timeUniform.write(accumulatedTime);

  const jitterX = (halton(frameIndex % 16, 2) - 0.5) / width;
  const jitterY = (halton(frameIndex % 16, 3) - 0.5) / height;
  jitterUniform.write(d.vec2f(jitterX, jitterY));
  frameIndex++;

  rayMarchPipeline.with(envMapBindGroup).dispatchThreads(width, height);

  postProcessing.runTaa();

  postProcessing.runBloom();

  postProcessing.render(context.getCurrentTexture().createView());

  animationFrame = requestAnimationFrame(run);
}

animationFrame = requestAnimationFrame(run);

export const controls = {
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
      bloomUniform.writePartial({ threshold: v });
    },
  },
  'bloom intensity': {
    min: 0,
    max: 2,
    initial: initialBloom.intensity,
    step: 0.01,
    onSliderChange(v: number) {
      bloomUniform.writePartial({ intensity: v });
    },
  },
  'blend factor': {
    min: 0.00001,
    max: 0.5,
    step: 0.00001,
    initial: 0.004,
    onSliderChange(v: number) {
      blendFactorUniform.write(v);
    },
  },
  time: {
    min: -1,
    max: 1,
    initial: 0.5,
    step: 0.01,
    onSliderChange(v: number) {
      timeScale = v;
    },
  },
};

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  cameraResult.cleanupCamera();
  perlinCache.destroy();
  root.destroy();
}
