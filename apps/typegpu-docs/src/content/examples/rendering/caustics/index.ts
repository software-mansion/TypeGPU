import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';

const mainVertex = tgpu['~unstable'].vertexFn({
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
const tilePattern = tgpu['~unstable'].fn([d.vec2f], d.f32)((uv) => {
  const tiledUv = std.fract(uv);
  const proximity = std.abs(std.sub(std.mul(tiledUv, 2), 1));
  const maxProximity = std.max(proximity.x, proximity.y);
  return std.clamp(std.pow(1 - maxProximity, 0.6) * 5, 0, 1);
});

const caustics = tgpu['~unstable'].fn([d.vec2f, d.f32, d.vec3f], d.vec3f)(
  (uv, time, profile) => {
    const distortion = perlin3d.sample(d.vec3f(std.mul(uv, 0.5), time * 0.2));
    // Distorting UV coordinates
    const uv2 = std.add(uv, distortion);
    const noise = std.abs(perlin3d.sample(d.vec3f(std.mul(uv2, 5), time)));
    return std.pow(d.vec3f(1 - noise), profile);
  },
);

const clamp01 = tgpu['~unstable'].fn([d.f32], d.f32)((v) => {
  return std.clamp(v, 0, 1);
});

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in the XY plane (around the imaginary Z axis)
 */
const rotateXY = tgpu['~unstable'].fn([d.f32], d.mat2x2f)((angle) => {
  return d.mat2x2f(
    /* right */ d.vec2f(std.cos(angle), std.sin(angle)),
    /* up    */ d.vec2f(-std.sin(angle), std.cos(angle)),
  );
});

const root = await tgpu.init();

const timeUniform = root['~unstable'].createUniform(d.f32);

/** Controls the angle of rotation for the pool tile texture */
const angle = 0.2;
/** The bigger the number, the denser the pool tile texture is */
const tileDensityUniform = root['~unstable'].createUniform(d.f32);
/** The scene fades into this color at a distance */
const fogColor = d.vec3f(0.05, 0.2, 0.7);
/** The ambient light color */
const ambientColor = d.vec3f(0.2, 0.5, 1);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const time = timeUniform.value;
  const tileDensity = tileDensityUniform.value;

  /**
   * A transformation matrix that skews the perspective a bit
   * when applied to UV coordinates
   */
  const skewMat = d.mat2x2f(
    d.vec2f(std.cos(angle), std.sin(angle)),
    d.vec2f(-std.sin(angle) * 10 + uv.x * 3, std.cos(angle) * 5),
  );
  const skewedUv = std.mul(skewMat, uv);
  const tile = tilePattern(std.mul(skewedUv, tileDensity));
  const albedo = std.mix(d.vec3f(0.1), d.vec3f(1), tile);

  // Transforming coordinates to simulate perspective squash
  const cuv = d.vec2f(
    uv.x * (std.pow(uv.y * 1.5, 3) + 0.1) * 5,
    std.pow((uv.y * 1.5 + 0.1) * 1.5, 3) * 1,
  );
  // Generating two layers of caustics (large scale, and small scale)
  const c1 = std.mul(
    caustics(cuv, time * 0.2, /* profile */ d.vec3f(4, 4, 1)),
    // Tinting
    d.vec3f(0.4, 0.65, 1),
  );
  const c2 = std.mul(
    caustics(std.mul(cuv, 2), time * 0.4, /* profile */ d.vec3f(16, 1, 4)),
    // Tinting
    d.vec3f(0.18, 0.3, 0.5),
  );

  // -- BLEND --

  const blendCoord = d.vec3f(std.mul(uv, d.vec2f(5, 10)), time * 0.2 + 5);
  // A smooth blending factor, so that caustics only appear at certain spots
  const blend = clamp01(perlin3d.sample(blendCoord) + 0.3);

  // -- FOG --

  const noFogColor = std.mul(
    albedo,
    std.mix(ambientColor, std.add(c1, c2), blend),
  );
  // Fog blending factor, based on the height of the pixels
  const fog = std.min(std.pow(uv.y, 0.5) * 1.2, 1);

  // -- GOD RAYS --

  const godRayUv = std.mul(std.mul(rotateXY(-0.3), uv), d.vec2f(15, 3));
  const godRayFactor = std.pow(uv.y, 1);
  const godRay1 = std.mul(
    std.add(perlin3d.sample(d.vec3f(godRayUv, time * 0.5)), 1),
    // Tinting
    std.mul(d.vec3f(0.18, 0.3, 0.5), godRayFactor),
  );
  const godRay2 = std.mul(
    std.add(perlin3d.sample(d.vec3f(std.mul(godRayUv, 2), time * 0.3)), 1),
    // Tinting
    std.mul(d.vec3f(0.18, 0.3, 0.5), godRayFactor * 0.4),
  );
  const godRays = std.add(godRay1, godRay2);

  return d.vec4f(std.add(std.mix(noFogColor, fogColor, fog), godRays), 1);
});

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

let isRunning = true;
function draw(timestamp: DOMHighResTimeStamp) {
  if (!isRunning) return;

  timeUniform.write((timestamp * 0.001) % 1000);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// #region Example controls and cleanup

export const controls = {
  'tile density': {
    initial: 10,
    min: 5,
    max: 20,
    step: 1,
    onSliderChange: (density: number) => {
      tileDensityUniform.write(density);
    },
  },
};

export function onCleanup() {
  isRunning = false;
  root.destroy();
}

// #endregion
