import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const mainVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})(({ vertexIndex }) => {
  const pos = [d.vec2f(0, 0.8), d.vec2f(-0.8, -0.8), d.vec2f(0.8, -0.8)];
  const uv = [d.vec2f(0.5, 1), d.vec2f(0, 0), d.vec2f(1, 0)];

  return {
    pos: d.vec4f(pos[vertexIndex], 0, 1),
    uv: uv[vertexIndex],
  };
});

/**
 * Given a coordinate, it returns a grayscale floor tile pattern at that
 * location.
 */
const tilePattern = (uv: d.v2f): number => {
  'use gpu';
  const tiledUv = std.fract(uv);
  const proximity = std.abs(tiledUv * 2 - 1);
  const maxProximity = std.max(proximity.x, proximity.y);
  return std.saturate((1 - maxProximity) ** 0.6 * 5);
};

const caustics = (uv: d.v2f, time: number, profile: d.v3f): d.v3f => {
  'use gpu';
  const distortion = perlin3d.sample(d.vec3f(uv * 0.5, time * 0.2));
  // Distorting UV coordinates
  const uv2 = uv + distortion;
  const noise = std.abs(perlin3d.sample(d.vec3f(uv2 * 5, time)));
  return std.pow(d.vec3f(1 - noise), profile);
};

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in the XY plane (around the imaginary Z axis)
 */
const rotateXY = (angle: number): d.m2x2f => {
  'use gpu';
  return d.mat2x2f(
    /* right */ d.vec2f(std.cos(angle), std.sin(angle)),
    /* up    */ d.vec2f(-std.sin(angle), std.cos(angle)),
  );
};

const root = await tgpu.init();

/** Seconds passed since the start of the example, wrapped to the range [0, 1000) */
const time = root.createUniform(d.f32);
/** Controls the angle of rotation for the pool tile texture */
const angle = 0.2;
/** The bigger the number, the denser the pool tile texture is */
const tileDensity = root.createUniform(d.f32);
/** The scene fades into this color at a distance */
const fogColor = d.vec3f(0.05, 0.2, 0.7);
/** The ambient light color */
const ambientColor = d.vec3f(0.2, 0.5, 1);

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  /**
   * A transformation matrix that skews the perspective a bit
   * when applied to UV coordinates
   */
  const skewMat = d.mat2x2f(
    d.vec2f(std.cos(angle), std.sin(angle)),
    d.vec2f(-std.sin(angle) * 10 + uv.x * 3, std.cos(angle) * 5),
  );
  const skewedUv = skewMat * uv;
  const tile = tilePattern(skewedUv * tileDensity.$);
  const albedo = std.mix(d.vec3f(0.1), d.vec3f(1), tile);

  // Transforming coordinates to simulate perspective squash
  const cuv = d.vec2f(
    uv.x * (std.pow(uv.y * 1.5, 3) + 0.1) * 5,
    std.pow((uv.y * 1.5 + 0.1) * 1.5, 3) * 1,
  );
  // Generating two layers of caustics (large scale, and small scale)
  const c1 =
    caustics(cuv, time.$ * 0.2, /* profile */ d.vec3f(4, 4, 1)) *
    // Tinting
    d.vec3f(0.4, 0.65, 1);
  const c2 =
    caustics(cuv * 2, time.$ * 0.4, /* profile */ d.vec3f(16, 1, 4)) *
    // Tinting
    d.vec3f(0.18, 0.3, 0.5);

  // -- BLEND --

  const blendCoord = d.vec3f(uv * d.vec2f(5, 10), time.$ * 0.2 + 5);
  // A smooth blending factor, so that caustics only appear at certain spots
  const blend = std.saturate(perlin3d.sample(blendCoord) + 0.3);

  // -- FOG --

  const noFogColor = albedo * std.mix(ambientColor, c1 + c2, blend);
  // Fog blending factor, based on the height of the pixels
  const fog = std.min(uv.y ** 0.5 * 1.2, 1);

  // -- GOD RAYS --

  const godRayUv = rotateXY(-0.3) * uv * d.vec2f(15, 3);
  const godRayFactor = uv.y;
  const godRay1 =
    (perlin3d.sample(d.vec3f(godRayUv, time.$ * 0.5)) + 1) *
    // Tinting
    d.vec3f(0.18, 0.3, 0.5) *
    godRayFactor;
  const godRay2 =
    (perlin3d.sample(d.vec3f(godRayUv * 2, time.$ * 0.3)) + 1) *
    // Tinting
    d.vec3f(0.18, 0.3, 0.5) *
    godRayFactor *
    0.4;
  const godRays = godRay1 + godRay2;

  return d.vec4f(std.mix(noFogColor, fogColor, fog) + godRays, 1);
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const pipeline = root.createRenderPipeline({
  vertex: mainVertex,
  fragment: mainFragment,
});

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) return;

  time.write((timestamp * 0.001) % 1000);

  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// #region Example controls and cleanup

export const controls = defineControls({
  'tile density': {
    initial: 10,
    min: 5,
    max: 20,
    step: 1,
    onSliderChange: (density) => {
      tileDensity.write(density);
    },
  },
});

export function onCleanup() {
  isRunning = false;
  root.destroy();
}

// #endregion
