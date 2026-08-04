import tgpu, { common, d, std } from 'typegpu';
import * as m from 'wgpu-matrix';
import { directionToEquirectUv, loadEnvironmentCubemap } from './common/cubemap.ts';
import { loadModel } from './common/model.ts';
import { AwardMaterial, primaryRayDir, sharedLayout, tonemapForDisplay } from './common/shading.ts';
import { createMeshRenderer } from './mesh/renderer.ts';
import { scene } from './scene.ts';
import { createSdfRenderer } from './sdf/renderer.ts';
import { defineControls } from '../../common/defineControls.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const loadingScreen = document.querySelector('.spinner-background') as HTMLDivElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const camera = root.createUniform(Camera);
const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: scene.camera.awayFromStagePosition,
    target: scene.camera.target,
    minZoom: scene.camera.minZoom,
    maxZoom: scene.camera.maxZoom,
  },
  (updates) => camera.patch(updates),
);

const { texture: cubemapTexture, equirectTexture } = await loadEnvironmentCubemap(
  root,
  '/TypeGPU/assets/os-awards/environment.jpg',
);
const award = await loadModel(root, '/TypeGPU/assets/os-awards/award_cleanup.glb');

const awardMaterial = root.createUniform(AwardMaterial, {
  baseColorFactor: award.baseColorFactor,
  metallicFactor: award.metallicFactor,
  roughnessFactor: award.roughnessFactor,
});
const awardTransform = root.createUniform(d.mat4x4f);
const awardTransformInverse = root.createUniform(d.mat4x4f);

const sharedBindGroup = root.createBindGroup(sharedLayout, {
  camera: camera.buffer,
  awardTransform: awardTransform.buffer,
  awardTransformInverse: awardTransformInverse.buffer,
  material: awardMaterial.buffer,
  cubemap: cubemapTexture.createView(d.textureCube(d.f32)),
  equirect: equirectTexture.createView(d.texture2d(d.f32), { format: 'rgba8unorm-srgb' }),
  baseColor: award.baseColorTexture.createView(d.texture2d(d.f32), {
    format: 'rgba8unorm-srgb',
  }),
  metallicRoughness: award.metallicRoughnessTexture.createView(d.texture2d(d.f32)),
  filteringSampler: root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  }),
});

const envFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const uv = directionToEquirectUv(primaryRayDir(input.uv));
  const color = std.textureSampleBias(
    sharedLayout.$.equirect,
    sharedLayout.$.filteringSampler,
    uv,
    0,
  ).rgb;
  return d.vec4f(tonemapForDisplay(color), 1);
});

const envPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: envFragment,
});

const renderers = {
  sdf: createSdfRenderer(root, context),
  mesh: createMeshRenderer(root, context, canvas, award),
};
let renderer: keyof typeof renderers = 'sdf';

const awardOffset = d.vec3f(
  -(award.boundsMin.x + award.boundsMax.x) / 2,
  -(award.boundsMin.y + award.boundsMax.y) / 2,
  -(award.boundsMin.z + award.boundsMax.z) / 2,
);
const awardScale =
  1.2 /
  Math.max(
    award.boundsMax.x - award.boundsMin.x,
    award.boundsMax.y - award.boundsMin.y,
    award.boundsMax.z - award.boundsMin.z,
  );

const transformDraft = d.mat4x4f();
const inverseDraft = d.mat4x4f();
let autoRotateAward = true;
let awardRotation = scene.award.initialRotation;
let lastFrameTimeMs: number | undefined;

function updateAwardTransform(timeMs: number) {
  const deltaTimeMs = lastFrameTimeMs === undefined ? 0 : Math.max(0, timeMs - lastFrameTimeMs);
  lastFrameTimeMs = timeMs;
  if (autoRotateAward) {
    awardRotation += deltaTimeMs * scene.award.autoRotationSpeed;
  }

  m.mat4.rotationY(awardRotation, transformDraft);
  m.mat4.uniformScale(transformDraft, awardScale, transformDraft);
  m.mat4.translate(transformDraft, awardOffset, transformDraft);

  awardTransform.write(transformDraft);
  awardTransformInverse.write(m.mat4.invert(transformDraft, inverseDraft));
}

let exampleDestroyed = false;
let firstFrameDrawn = false;

function frame(timeMs: number) {
  if (exampleDestroyed) {
    return;
  }
  updateAwardTransform(timeMs);

  envPipeline.with(sharedBindGroup).withColorAttachment({ view: context }).draw(3);
  renderers[renderer].draw(sharedBindGroup);

  if (!firstFrameDrawn) {
    loadingScreen.style.display = 'none';
    firstFrameDrawn = true;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export const controls = defineControls({
  Renderer: {
    initial: renderer,
    options: ['sdf', 'mesh'],
    onSelectChange(value) {
      renderer = value;
    },
  },
  'Auto-rotate model': {
    initial: autoRotateAward,
    onToggleChange(value) {
      autoRotateAward = value;
    },
  },
});

export function onCleanup() {
  exampleDestroyed = true;
  cleanupCamera();
  renderers.sdf.destroy();
  renderers.mesh.destroy();
  root.destroy();
}
