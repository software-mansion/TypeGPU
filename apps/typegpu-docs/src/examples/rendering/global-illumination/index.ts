import * as hrc from '@typegpu/radiance-cascades/holographic';
import { linearToSrgb } from '@typegpu/color';
import { sdBox2d } from '@typegpu/sdf';
import { common, d, std, tgpu, type TgpuCommandEncoder } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { normalAt, scene, sceneSize, type Surface } from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const gridSize = 256;
const cellSize = sceneSize / gridSize;

const lampPosition = root.createUniform(d.vec2f, [110, 118]);

const lampDistance = (p: d.v2f) => {
  'use gpu';
  return sdBox2d(p - lampPosition.$, d.vec2f(2, 15)) - 3;
};

function createGridTexture() {
  return root
    .createTexture({ size: [gridSize, gridSize], format: 'rgba16float' })
    .$usage('storage', 'sampled');
}

const baseEmission = createGridTexture();
const baseWrite = baseEmission.createView(d.textureStorage2d('rgba16float'));
const baseRead = baseEmission.createView(d.texture2d(d.f32));

const emission = createGridTexture();
const emissionWrite = emission.createView(d.textureStorage2d('rgba16float'));
const emissionRead = emission.createView(d.texture2d(d.f32));

const medium = createGridTexture();
const mediumWrite = medium.createView(d.textureStorage2d('rgba16float'));
const mediumRead = medium.createView(d.texture2d(d.f32));

const lighting = hrc.create({
  root,
  size: { width: gridSize, height: gridSize },
  medium: (pixel) => {
    'use gpu';
    return {
      emission: std.textureLoad(emissionRead.$, pixel, 0).rgb,
      extinction: std.textureLoad(mediumRead.$, pixel, 0).r,
    };
  },
});

const radiance = lighting.output.createView(d.texture2d(d.f32));
const sectors = lighting.sectors.createView(d.texture2dArray(d.f32));
const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

const rasterize = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const p = (d.vec2f(gid.xy) + 0.5) * cellSize;
  const surface = std.saturate(0.5 - scene(p).distance / cellSize);
  const lamp = std.saturate(0.5 - lampDistance(p) / cellSize);

  const base = d.vec4f(d.vec3f(lamp * 64 * cellSize), surface);
  const extinction = d.vec3f(std.max(surface, lamp) * 16 * cellSize);

  std.textureStore(baseWrite.$, gid.xy, base);
  std.textureStore(emissionWrite.$, gid.xy, base);
  std.textureStore(mediumWrite.$, gid.xy, d.vec4f(extinction, 0));
});

const reflected = (p: d.v2f, surface: d.InferGPU<typeof Surface>, normal: d.v2f) => {
  'use gpu';
  let boundary = p + normal * std.max(-surface.distance, 0);
  for (const _ of tgpu.unroll([0, 1, 2])) {
    boundary += normal * std.max(-scene(boundary).distance, 0);
  }

  const uv = (boundary + normal * cellSize * 1.5) / sceneSize;
  const angle = std.atan2(normal.y, normal.x);

  let incident = d.vec3f();
  for (const sector of tgpu.unroll([0, 1, 2, 3])) {
    const relative = std.mod((sector * Math.PI) / 2 - angle + Math.PI, 2 * Math.PI) - Math.PI;
    const low = std.clamp(relative - Math.PI / 4, -Math.PI / 2, Math.PI / 2);
    const high = std.clamp(relative + Math.PI / 4, -Math.PI / 2, Math.PI / 2);
    const light = std.textureSampleLevel(sectors.$, sampler.$, uv, sector, 0).rgb;
    incident += light * (std.sin(high) - std.sin(low));
  }

  return incident * 2 * surface.albedo;
};

const bounce = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const p = (d.vec2f(gid.xy) + 0.5) * cellSize;
  const base = std.textureLoad(baseRead.$, gid.xy, 0);
  const surface = scene(p);

  let source = d.vec3f(base.rgb);
  if (surface.distance > -cellSize * 1.5 && base.a > 0) {
    const extinction = std.textureLoad(mediumRead.$, gid.xy, 0).rgb;
    source += reflected(p, surface, normalAt(p, 0.5)) * extinction;
  }

  std.textureStore(emissionWrite.$, gid.xy, d.vec4f(source, base.a));
});

const displayFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const p = uv * sceneSize;
  const surface = scene(p);

  const aa = std.max(std.fwidth(surface.distance), 0.25);
  const solid = 1 - std.smoothstep(-aa, aa, surface.distance);
  const lamp = 1 - std.smoothstep(-aa, aa, lampDistance(p));
  const inside = 1 - std.smoothstep(-aa, aa, sdBox2d(p - 256, d.vec2f(220)) - 12);

  const light = std.textureSampleLevel(radiance.$, sampler.$, uv, 0).rgb;
  let wall = d.vec3f();
  if (solid > 0) {
    wall = reflected(p, surface, normalAt(p, 6)) / Math.PI;
  }

  const color = light * (1 - solid) + wall * solid + lamp * 4;
  const mapped = color / (0.5 + std.max(color.r, std.max(color.g, color.b)));
  return d.vec4f(linearToSrgb(mapped) * inside, 1);
});

const rasterizePipeline = root.createComputePipeline({ compute: rasterize });
const bouncePipeline = root.createComputePipeline({ compute: bounce });
const displayPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: displayFragment,
});

let bounces = 2;
let lightingDirty = true;

function updateLighting(encoder: TgpuCommandEncoder) {
  const pass = encoder.beginComputePass();

  rasterizePipeline.with(pass).dispatchWorkgroups(gridSize / 8, gridSize / 8);
  lighting.run({ pass });

  for (let i = 0; i < bounces; i++) {
    bouncePipeline.with(pass).dispatchWorkgroups(gridSize / 8, gridSize / 8);
    lighting.run({ pass });
  }

  pass.end();
}

let frameId = requestAnimationFrame(frame);
function frame() {
  const encoder = root['~unstable'].createCommandEncoder();

  if (lightingDirty) {
    updateLighting(encoder);
    lightingDirty = false;
  }

  const pass = encoder.beginRenderPass({ colorAttachments: { view: context } });
  displayPipeline.with(pass).draw(3);
  pass.end();

  encoder.submit();
  frameId = requestAnimationFrame(frame);
}

function moveLamp(event: PointerEvent) {
  if (event.type === 'pointerdown') {
    canvas.setPointerCapture(event.pointerId);
  }
  if (!canvas.hasPointerCapture(event.pointerId)) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  lampPosition.write([
    ((event.clientX - rect.left) / rect.width) * sceneSize,
    ((event.clientY - rect.top) / rect.height) * sceneSize,
  ]);
  lightingDirty = true;
}

canvas.addEventListener('pointerdown', moveLamp);
canvas.addEventListener('pointermove', moveLamp);

// #region Example controls and cleanup

export const controls = defineControls({
  Bounces: {
    initial: 2,
    min: 0,
    max: 4,
    step: 1,
    onSliderChange: (value) => {
      bounces = value;
      lightingDirty = true;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
