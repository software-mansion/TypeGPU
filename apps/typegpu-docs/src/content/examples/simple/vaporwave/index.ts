import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sdPlane } from '@typegpu/sdf';
import { perlin3d } from '@typegpu/noise';

import { circles, grid } from './floor.ts';
import * as c from './constants.ts';
import { Ray } from './types.ts';
import { getSphere } from './sphere.ts';
import { rayUnion } from './helpers.ts';

// == INIT ==
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// == BUFFERS ==
const floorAngleBuffer = root.createUniform(d.f32);
const sphereAngleBuffer = root.createUniform(d.f32);
const glowIntensityBuffer = root.createUniform(d.f32);
const resolution = root.createUniform(d.vec2f);

let floorSpeed = 1;
let sphereSpeed = 1;
let glowIntensity = 0.14;

let sphereColor = d.vec3f(0, 0.25, 1);
const sphereColorBuffer = root.createUniform(d.vec3f);
sphereColorBuffer.write(sphereColor);

const floorPatternSlot = tgpu.slot(circles);

// == RAYMARCHING ==

// returns smallest distance to some object in the scene
const getSceneRay = tgpu.fn(
  [d.vec3f],
  Ray,
)((p) => {
  const floor = Ray({
    dist: sdPlane(p, c.planeOrthonormal, c.planeOffset),
    color: floorPatternSlot.$(p.xz, floorAngleBuffer.$),
  });
  const sphere = getSphere(
    p,
    sphereColorBuffer.$,
    c.sphereCenter,
    sphereAngleBuffer.$,
  );

  return rayUnion(floor, sphere);
});

const rayMarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.struct({ ray: Ray, glow: d.vec3f }),
)((ro, rd) => {
  let distOrigin = d.f32();
  const result = Ray({
    dist: d.f32(c.MAX_DIST),
    color: d.vec3f(),
  });

  let glow = d.vec3f();

  for (let i = 0; i < c.MAX_STEPS; i++) {
    const p = std.add(ro, std.mul(rd, distOrigin));
    const scene = getSceneRay(p);
    const sphereDist = getSphere(
      p,
      sphereColorBuffer.$,
      c.sphereCenter,
      sphereAngleBuffer.$,
    );

    glow = std.add(
      glow,
      std.mul(sphereColorBuffer.$, std.exp(-sphereDist.dist)),
    );

    distOrigin += scene.dist;

    if (distOrigin > c.MAX_DIST) {
      result.dist = c.MAX_DIST;
      break;
    }

    if (scene.dist < c.SURF_DIST) {
      result.dist = distOrigin;
      result.color = scene.color;
      break;
    }
  }

  return { ray: result, glow };
});

const vertexMain = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})(({ idx }) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 0), d.vec2f(2, 0), d.vec2f(0, 2)];

  return {
    pos: d.vec4f(pos[idx], 0.0, 1.0),
    uv: uv[idx],
  };
});

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = std.sub(std.mul(input.uv, 2), 1);
  uv.x *= resolution.$.x / resolution.$.y;

  // ray origin and direction
  const ro = d.vec3f(0, 2, -1);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, 1));

  // marching
  const march = rayMarch(ro, rd);

  // sky gradient
  const y = std.add(ro, std.mul(rd, march.ray.dist)).y - 2; // camera at level 2
  const sky = std.mix(c.skyColor1, c.skyColor2, y / c.MAX_DIST);

  // fog coefficient
  const fog = std.min(march.ray.dist / c.MAX_DIST, 1);

  return std.mix(
    std.mix(d.vec4f(march.ray.color, 1), sky, fog),
    d.vec4f(march.glow, 1),
    glowIntensityBuffer.$,
  );
});

// == PIPELINE ==
const perlinCache = perlin3d.staticCache({
  root: root,
  size: d.vec3u(7),
});

let renderPipeline = root['~unstable']
  .with(floorPatternSlot, circles)
  .pipe(perlinCache.inject())
  .withVertex(vertexMain, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let animationFrame: number;
let floorAngle = 0;
let sphereAngle = 0;
let prevAngle = 0;
function run(timestamp: number) {
  const curAngle = (timestamp / 1000) % c.PERIOD / c.PERIOD * 2 * Math.PI;
  const delta = (curAngle + 2 * Math.PI - prevAngle) % (2 * Math.PI);
  prevAngle = curAngle;

  floorAngle += delta * floorSpeed;
  floorAngle %= c.NUM_CYCLES * Math.PI * 2;
  sphereAngle += delta * sphereSpeed;
  sphereAngle %= c.NUM_CYCLES * Math.PI * 2;

  floorAngleBuffer.write(floorAngle);
  sphereAngleBuffer.write(sphereAngle);
  glowIntensityBuffer.write(glowIntensity);
  resolution.write(d.vec2f(canvas.width, canvas.height));

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  animationFrame = requestAnimationFrame(run);
}

animationFrame = requestAnimationFrame(run);

// #region Example controls and cleanup

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  root.destroy();
}

export const controls = {
  'glow intensity': {
    initial: glowIntensity,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(value: number) {
      glowIntensity = value;
    },
  },
  'floor speed': {
    initial: floorSpeed,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange(value: number) {
      floorSpeed = value;
    },
  },
  'sphere speed': {
    initial: sphereSpeed,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange(value: number) {
      sphereSpeed = value;
    },
  },
  'sphere color': {
    initial: [...sphereColor] as const,
    onColorChange: (value: readonly [number, number, number]) => {
      sphereColor = d.vec3f(...value);
      sphereColorBuffer.write(sphereColor);
    },
  },
  'floor pattern': {
    initial: 'circles',
    options: ['grid', 'circles'],
    onSelectChange: (value: string) => {
      renderPipeline = root['~unstable']
        .with(floorPatternSlot, value === 'grid' ? grid : circles)
        .pipe(perlinCache.inject())
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: presentationFormat })
        .createPipeline();
    },
  },
};

// #endregion
