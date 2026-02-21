import * as sdf from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { Ray } from './types.ts';
import { perlin2d, perlin3d } from '@typegpu/noise';
import { mat3x3f } from 'typegpu/data';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const time = root.createUniform(d.f32);
const resolution = root.createUniform(d.vec2f);
const cameraUniform = root.createUniform(Camera);

const MAX_STEPS = 1000;
const MAX_DIST = 30;
const SURF_DIST = 0.001;

const skyColor = d.vec4f(0.7, 0.8, 0.9, 1);

// Structure to hold both distance and color
type Shape = d.InferGPU<typeof Shape>;
const Shape = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const checkerBoard = (uv: d.v2f): number => {
  'use gpu';
  const fuv = std.floor(uv);
  return std.abs(fuv.x + fuv.y) % 2;
};

const smoothShapeUnion = (a: Shape, b: Shape, k: number): Shape => {
  'use gpu';
  const h = std.max(k - std.abs(a.dist - b.dist), 0) / k;
  const m = h * h;

  // Smooth min for distance
  const dist = std.min(a.dist, b.dist) - m * k * (1 / d.f32(4));

  // Blend colors based on relative distances and smoothing
  const weight = m + std.select(0, 1 - m, a.dist > b.dist);
  const color = std.mix(a.color, b.color, weight);

  return Shape({ dist, color });
};

const shapeUnion = (a: Shape, b: Shape) => {
  'use gpu';
  return Shape({
    color: std.select(a.color, b.color, a.dist > b.dist),
    dist: std.min(a.dist, b.dist),
  });
};

const sdRing = (_p: d.v2f, n: d.v2f, r: number, th: number): number => {
  'use gpu';
  let p = d.vec2f(_p);
  p.x = std.abs(p.x);
  p = d.mat2x2f(n.x, n.y, -n.y, n.x) * p;
  return std.max(
    std.abs(std.length(p) - r) - th * 0.5,
    std.length(d.vec2f(p.x, std.max(0.0, std.abs(r - p.y) - th * 0.5))) *
      std.sign(p.x),
  );
};

const PIE = {
  baseHalfHeight: 0.005,
  cheeseHalfHeight: 0.005,
  radius: 0.5,
  baseRoundness: 0.01,
  cheeseRoundness: 0.0025,
};

const sdPizzaCheese = (p: d.v3f, angle: number): Shape => {
  'use gpu';
  const pieBase2d = sdf.sdPie(
    p.xz,
    d.vec2f(std.sin(angle / 2), std.cos(angle / 2)),
    PIE.radius * 0.9,
  ) + PIE.cheeseRoundness;

  let pieBaseSd = sdf.opExtrudeY(
    p - d.vec3f(0, PIE.baseHalfHeight + 0.01, 0),
    pieBase2d,
    PIE.cheeseHalfHeight,
  ) - PIE.cheeseRoundness;

  const cheeseAngle1 = angle / 2 + 0.4;
  const cheeseStrings2d = std.min(
    sdRing(
      p.xz,
      d.vec2f(std.cos(cheeseAngle1), std.sin(cheeseAngle1)),
      PIE.radius * 0.3 + perlin2d.sample(p.xz * 2 + angle + 0.4) * 0.2,
      0.05,
    ),
    sdRing(
      p.xz,
      d.vec2f(std.cos(cheeseAngle1), std.sin(cheeseAngle1)),
      PIE.radius * 0.6 + perlin2d.sample(p.xz * 2 + angle) * 0.2,
      0.05,
    ),
    sdf.sdDisk(
      p.xz,
      PIE.radius * 0.2 + perlin2d.sample(p.xz * 2 + angle + 0.4) * 0.2,
    ),
  );

  pieBaseSd = sdf.opSmoothUnion(
    pieBaseSd,
    sdf.opExtrudeY(
      p - d.vec3f(0, PIE.baseHalfHeight, 0),
      cheeseStrings2d,
      PIE.cheeseHalfHeight * 0.3,
    ),
    0.02,
  );

  const pieBase = Shape({
    dist: pieBaseSd + perlin3d.sample(p * 5) * 0.01,
    color: d.vec3f(1, 0.95, 0.7),
  });

  return pieBase;
};

const sdPizzaCrust = (p: d.v3f, angle: number): Shape => {
  'use gpu';
  const pieBase2d = sdf.sdPie(
    p.xz - d.vec2f(0, 0.005),
    d.vec2f(std.sin(angle / 2), std.cos(angle / 2)),
    PIE.radius,
  ) + PIE.baseRoundness;
  const crust2d = sdRing(
    p.xz,
    d.vec2f(std.cos(angle / 2 - 0.05), std.sin(angle / 2 - 0.05)),
    PIE.radius,
    0.05,
  );
  const pieBase = Shape({
    dist: sdf.opExtrudeY(p, pieBase2d, PIE.baseHalfHeight) - PIE.baseRoundness,
    color: d.vec3f(0),
  });

  const crustOffset = perlin3d.sample(p * 10) * 0.02;
  const crust = Shape({
    dist: sdf.opExtrudeY(
      p - d.vec3f(0, crustOffset, 0),
      crust2d,
      PIE.baseHalfHeight * 5,
    ) - 0.01,
    color: d.vec3f(0.6, 0.4, 0.3) * (1 - crustOffset * 10),
  });

  return smoothShapeUnion(pieBase, crust, 0.1);
};

/**
 * Returns a transformation matrix that represents an `angle` rotation
 * in the XZ plane (around the Y axis)
 */
const rotateXZ = tgpu.fn([d.f32], d.mat3x3f)((angle) =>
  d.mat3x3f(
    /* right   */ d.vec3f(std.cos(angle), 0, std.sin(angle)),
    /* up      */ d.vec3f(0, 1, 0),
    /* forward */ d.vec3f(-std.sin(angle), 0, std.cos(angle)),
  )
);

const getMorphingShape = (p: d.v3f, t: number): Shape => {
  'use gpu';
  // Center position
  const center = d.vec3f(0, PIE.baseHalfHeight, 0);
  const localP = std.sub(p, center);

  const a1 = 3 * Math.PI / 2;
  const p1 = localP;
  const p2 = localP * d.vec3f(-1, 1, -1) -
    d.vec3f(0, 0, std.abs(std.sin(t * 2)) * 0.1);
  const a2 = Math.PI / 2;

  const pizzaCrust = shapeUnion(sdPizzaCrust(p1, a1), sdPizzaCrust(p2, a2));
  const pizzaCheese = smoothShapeUnion(
    sdPizzaCheese(p1, a1),
    sdPizzaCheese(p2, a2),
    0.02,
  );
  return shapeUnion(pizzaCrust, pizzaCheese);
};

const getSceneDist = (p: d.v3f): Shape => {
  'use gpu';
  const shape = getMorphingShape(p, time.$);
  const floor = Shape({
    dist: sdf.sdPlane(p, d.vec3f(0, 1, 0), 0),
    color: std.mix(
      d.vec3f(1),
      d.vec3f(0.2),
      checkerBoard(std.mul(p.xz, 2)),
    ),
  });

  return shapeUnion(shape, floor);
};

const rayMarch = (ro: d.v3f, rd: d.v3f): Shape => {
  'use gpu';
  let dO = d.f32(0);
  const result = Shape({
    dist: d.f32(MAX_DIST),
    color: d.vec3f(0, 0, 0),
  });

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = ro.add(rd.mul(dO));
    const scene = getSceneDist(p);
    dO += scene.dist;

    if (dO > MAX_DIST || scene.dist < SURF_DIST) {
      result.dist = dO;
      result.color = d.vec3f(scene.color);
      break;
    }
  }

  return result;
};

const softShadow = (
  ro: d.v3f,
  rd: d.v3f,
  minT: number,
  maxT: number,
  k: number,
): number => {
  'use gpu';
  let res = d.f32(1);
  let t = minT;

  for (let i = 0; i < 100; i++) {
    if (t >= maxT) break;
    const h = getSceneDist(ro.add(rd.mul(t))).dist;
    if (h < 0.001) return 0;
    res = std.min(res, k * h / t);
    t += std.max(h, 0.001);
  }

  return res;
};

const getNormal = (p: d.v3f): d.v3f => {
  'use gpu';
  const dist = getSceneDist(p).dist;
  const e = 0.01;

  const n = d.vec3f(
    getSceneDist(p.add(d.vec3f(e, 0, 0))).dist - dist,
    getSceneDist(p.add(d.vec3f(0, e, 0))).dist - dist,
    getSceneDist(p.add(d.vec3f(0, 0, e))).dist - dist,
  );

  return std.normalize(n);
};

const getRayForUV = (uv: d.v2f) => {
  'use gpu';
  const camera = cameraUniform.$;
  const ndc = uv.mul(2).sub(1).mul(d.vec2f(1, -1));
  const farView = camera.projectionInverse.mul(d.vec4f(ndc.xy, 1, 1));
  const farWorld = camera.viewInverse.mul(
    d.vec4f(farView.xyz.div(farView.w), 1),
  );
  const direction = std.normalize(farWorld.xyz.sub(camera.position.xyz));
  return Ray({ origin: camera.position.xyz, direction });
};

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const ray = getRayForUV(uv);

  // Ray origin and direction
  const march = rayMarch(ray.origin, ray.direction);

  const fog = std.min(march.dist / MAX_DIST, 1) ** 0.7;

  const p = ray.origin + ray.direction * march.dist;
  const n = getNormal(p);

  // Lighting with orbiting light
  const l = std.normalize(d.vec3f(0.5, 1, -0.2));
  const diff = std.max(std.dot(n, l), 0);

  // Soft shadows
  const shadowRo = p;
  const shadowRd = l;
  const shadowDist = 4; // approximate
  const shadow = softShadow(shadowRo, shadowRd, 0.02, shadowDist, d.f32(16));

  // Combine lighting with shadows and color
  const litColor = march.color.mul(diff);
  const finalColor = std.mix(
    std.mul(litColor, 0.5), // Shadow color
    litColor, // Lit color
    shadow,
  );

  return std.mix(d.vec4f(finalColor, 1), skyColor, fog);
});

const cameraResult = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(2, 2, 2, 1), maxZoom: 4, minZoom: 1 },
  (newProps) => cameraUniform.writePartial(newProps),
);

const perlinCache2d = perlin2d.staticCache({ root, size: d.vec2u(16, 16) });
const perlinCache3d = perlin3d.staticCache({ root, size: d.vec3u(16, 16, 16) });
const renderPipeline = root
  .pipe(perlinCache2d.inject())
  .pipe(perlinCache3d.inject())
  .createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: fragmentMain,
    targets: { format: presentationFormat },
  });

let animationFrame: number;
function run(timestamp: number) {
  time.write(timestamp / 1000 % 1000);
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

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  cameraResult.cleanupCamera();
  root.destroy();
}
