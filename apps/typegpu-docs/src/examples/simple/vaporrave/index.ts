import { perlin3d } from '@typegpu/noise';
import { sdPlane } from '@typegpu/sdf';
import tgpu, { d, std } from 'typegpu';

import * as c from './constants.ts';
import { circles, grid } from './floor.ts';
import { rayUnion } from './helpers.ts';
import { getSphere } from './sphere.ts';
import { LightRay, Ray } from './types.ts';
import { defineControls } from '../../common/defineControls.ts';

// == INIT ==
const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// == BUFFERS ==
const floorAngleUniform = root.createUniform(d.f32);
const sphereAngleUniform = root.createUniform(d.f32);
const glowIntensityUniform = root.createUniform(
  d.f32,
  c.INITIAL_GLOW_INTENSITY,
);
const resolutionUniform = root.createUniform(d.vec2f);
const sphereColorUniform = root.createUniform(d.vec3f, c.initialSphereColor);

let floorSpeed = 0.1;
let sphereSpeed = 1;

const floorPatternSlot = tgpu.slot(circles);

// == RAYMARCHING ==

// returns smallest distance to some object in the scene
const getSceneRay = tgpu.fn([d.vec3f], Ray)((p) => {
  const floor = Ray({
    dist: sdPlane(p, c.planeOrthonormal, c.PLANE_OFFSET),
    color: floorPatternSlot.$(p.xz, floorAngleUniform.$),
  });
  const sphere = getSphere(
    p,
    sphereColorUniform.$,
    c.sphereCenter,
    sphereAngleUniform.$,
  );

  return rayUnion(floor, sphere);
});

const rayMarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  LightRay,
)((ro, rd) => {
  let distOrigin = d.f32();
  const result = Ray({
    dist: d.f32(c.MAX_DIST),
    color: d.vec3f(),
  });

  let glow = d.vec3f();

  for (let i = 0; i < c.MAX_STEPS; i++) {
    const p = rd.mul(distOrigin).add(ro);
    const scene = getSceneRay(p);
    const sphereDist = getSphere(
      p,
      sphereColorUniform.$,
      c.sphereCenter,
      sphereAngleUniform.$,
    );

    glow = d.vec3f(sphereColorUniform.$)
      .mul(std.exp(-sphereDist.dist))
      .add(glow);

    distOrigin += scene.dist;

    if (distOrigin > c.MAX_DIST) {
      result.dist = c.MAX_DIST;
      break;
    }

    if (scene.dist < c.SURF_DIST) {
      result.dist = distOrigin;
      result.color = d.vec3f(scene.color);
      break;
    }
  }

  return { ray: result, glow };
});

const vertexMain = tgpu.vertexFn({
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

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = input.uv.mul(2).sub(1);
  uv.x *= resolutionUniform.$.x / resolutionUniform.$.y;

  // ray origin and direction
  const ro = d.vec3f(0, 2, -1);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, 1));

  // marching
  const march = rayMarch(ro, rd);

  // sky gradient
  const y = rd.mul(march.ray.dist).add(ro).y - 2; // camera at level 2
  const sky = std.mix(c.skyColor1, c.skyColor2, y / c.MAX_DIST);

  // fog coefficient
  const fog = std.min(march.ray.dist / c.MAX_DIST, 1);

  return std.mix(
    std.mix(d.vec4f(march.ray.color, 1), sky, fog),
    d.vec4f(march.glow, 1),
    glowIntensityUniform.$,
  );
});

// == PIPELINE ==
const perlinCache = perlin3d.staticCache({
  root: root,
  size: d.vec3u(7),
});

let renderPipeline = root
  .with(floorPatternSlot, circles)
  .pipe(perlinCache.inject())
  .createRenderPipeline({
    vertex: vertexMain,
    fragment: fragmentMain,
  });

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

  floorAngleUniform.write(floorAngle);
  sphereAngleUniform.write(sphereAngle);
  resolutionUniform.write(d.vec2f(canvas.width, canvas.height));

  renderPipeline
    .withColorAttachment({ view: context })
    .draw(3);

  animationFrame = requestAnimationFrame(run);
}

animationFrame = requestAnimationFrame(run);

// #region Example controls and cleanup

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  root.destroy();
}

export const controls = defineControls({
  'glow intensity': {
    initial: c.INITIAL_GLOW_INTENSITY,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(value) {
      glowIntensityUniform.write(value);
    },
  },
  'floor speed': {
    initial: floorSpeed,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange(value) {
      floorSpeed = value;
    },
  },
  'sphere speed': {
    initial: sphereSpeed,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange(value) {
      sphereSpeed = value;
    },
  },
  'sphere color': {
    initial: c.initialSphereColor,
    onColorChange: (value) => {
      sphereColorUniform.write(value);
    },
  },
  'floor pattern': {
    initial: 'circles',
    options: ['grid', 'circles'],
    onSelectChange: (value) => {
      renderPipeline = root
        .with(floorPatternSlot, value === 'grid' ? grid : circles)
        .pipe(perlinCache.inject())
        .createRenderPipeline({
          vertex: vertexMain,
          fragment: fragmentMain,
        });
    },
  },
});

// #endregion
