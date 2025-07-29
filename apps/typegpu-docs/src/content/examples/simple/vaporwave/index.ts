import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sdPlane } from '@typegpu/sdf';
import { perlin3d } from '@typegpu/noise';

import { circles, grid } from './floor.ts';
import * as c from './constans.ts';
import { Ray } from './types.ts';
import { getBall } from './ball.ts';
import { shapeUnion } from './helpers.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init({
  device: { requiredFeatures: ['timestamp-query'] }, // was used to measure performance of static cache of perlin noise
});

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const time = root.createUniform(d.f32);
const resolution = root.createUniform(d.vec2f);

// these paramaters can be changed
let ballColor = d.vec3f(0, 0.25, 1);
let speedPerFrame = 11;

const ballColorBuf = root.createUniform(d.vec3f);
ballColorBuf.write(ballColor);
const speedPerFrameBuf = root.createUniform(d.f32);
speedPerFrameBuf.write(speedPerFrame);

const floorPatternSlot = tgpu.slot(grid);

// should return min distance to some world object
const getSceneDist = tgpu.fn(
  [d.vec3f],
  Ray,
)((p) => {
  const floor = Ray({
    dist: sdPlane(p, d.vec3f(0, 1, 0), 1), // hardcoded plane location
    color: floorPatternSlot.$(p.xz, speedPerFrameBuf.$, time.$),
  });
  const ball = getBall(p, ballColorBuf.$, c.ballCenter, time.$);

  return shapeUnion(floor, ball);
});

const rayMarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.struct({ ray: Ray, bloom: d.vec3f }),
)((ro, rd) => {
  let dO = d.f32(0);
  const result = Ray({
    dist: d.f32(c.MAX_DIST),
    color: d.vec3f(0, 1, 0), // green for debug
  });

  let bloom = d.vec3f(0, 0, 0);

  for (let i = 0; i < c.MAX_STEPS; i++) {
    const p = std.add(ro, std.mul(rd, dO));
    const scene = getSceneDist(p);
    const ballDist = getBall(p, ballColorBuf.$, c.ballCenter, time.$);
    bloom = std.add(bloom, std.mul(ballColorBuf.$, std.exp(-ballDist.dist)));
    dO += scene.dist;

    if (dO > c.MAX_DIST) {
      result.dist = c.MAX_DIST;
      break;
    }

    if (scene.dist < c.SURF_DIST) {
      result.dist = dO;
      result.color = scene.color;
      break;
    }
  }

  return { ray: result, bloom };
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

  // fog calculations
  const fog = std.min(march.ray.dist / c.MAX_DIST, 1);

  return std.mix(
    d.vec4f(march.bloom, 1),
    std.mix(d.vec4f(march.ray.color, 1), sky, fog),
    0.87, // this should not be hardcoded (but does just fine)
  );
});

const perlinCache = perlin3d.staticCache({
  root: root,
  size: d.vec3u(64),
});

let renderPipeline = root['~unstable']
  .with(floorPatternSlot, circles)
  .pipe(perlinCache.inject())
  .withVertex(vertexMain, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let animationFrame: number;
function run(timestamp: number) {
  time.write((timestamp / 1000) % 1000);
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
  speed: {
    initial: speedPerFrame,
    min: 0,
    max: 40,
    step: 0.1,
    onSliderChange(value: number) {
      speedPerFrame = value;
      speedPerFrameBuf.write(speedPerFrame);
    },
  },
  'sphere color': {
    initial: [ballColor.x, ballColor.y, ballColor.z] as const,
    onColorChange: (value: readonly [number, number, number]) => {
      ballColor = d.vec3f(value[0], value[1], value[2]);
      ballColorBuf.write(ballColor);
    },
  },
  'floor pattern': {
    initial: 'circles',
    options: ['grid', 'circles'],
    onSelectChange: (value: string) => {
      if (value === 'grid') {
        renderPipeline = root['~unstable']
          .with(floorPatternSlot, grid)
          .pipe(perlinCache.inject())
          .withVertex(vertexMain, {})
          .withFragment(fragmentMain, { format: presentationFormat })
          .createPipeline();
      } else if (value === 'circles') {
        renderPipeline = root['~unstable']
          .with(floorPatternSlot, circles)
          .pipe(perlinCache.inject())
          .withVertex(vertexMain, {})
          .withFragment(fragmentMain, { format: presentationFormat })
          .createPipeline();
      } else {
        /* should not happen */
      }
    },
  },
};

// #endregion
