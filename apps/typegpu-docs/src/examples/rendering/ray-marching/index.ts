import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sdBoxFrame3d, sdPlane, sdSphere } from '@typegpu/sdf';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const time = root.createUniform(d.f32);
const resolution = root.createUniform(d.vec2f);

const MAX_STEPS = 1000;
const MAX_DIST = 30;
const SURF_DIST = 0.001;

const skyColor = d.vec4f(0.7, 0.8, 0.9, 1);

// Structure to hold both distance and color
const Shape = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const checkerBoard = tgpu.fn([d.vec2f], d.f32)((uv) => {
  const fuv = std.floor(uv);
  return std.abs(fuv.x + fuv.y) % 2;
});

const smoothShapeUnion = tgpu.fn([Shape, Shape, d.f32], Shape)((a, b, k) => {
  const h = std.max(k - std.abs(a.dist - b.dist), 0) / k;
  const m = h * h;

  // Smooth min for distance
  const dist = std.min(a.dist, b.dist) - m * k * (1 / d.f32(4));

  // Blend colors based on relative distances and smoothing
  const weight = m + std.select(0, 1 - m, a.dist > b.dist);
  const color = std.mix(a.color, b.color, weight);

  return { dist, color };
});

const shapeUnion = tgpu.fn([Shape, Shape], Shape)((a, b) => ({
  color: std.select(a.color, b.color, a.dist > b.dist),
  dist: std.min(a.dist, b.dist),
}));

const getMorphingShape = tgpu.fn([d.vec3f, d.f32], Shape)((p, t) => {
  // Center position
  const center = d.vec3f(0, 2, 6);
  const localP = std.sub(p, center);
  const rotMatZ = d.mat4x4f.rotationZ(-t);
  const rotMatX = d.mat4x4f.rotationX(-t * 0.6);
  const rotatedP = std.mul(rotMatZ, std.mul(rotMatX, d.vec4f(localP, 1))).xyz;

  // Animate shapes
  const boxSize = d.vec3f(0.7);

  // Create two spheres that move in a circular pattern
  const sphere1Offset = d.vec3f(
    std.cos(t * 2) * 0.8,
    std.sin(t * 3) * 0.3,
    std.sin(t * 2) * 0.8,
  );
  const sphere2Offset = d.vec3f(
    std.cos(t * 2 + 3.14) * 0.8,
    std.sin(t * 3 + 1.57) * 0.3,
    std.sin(t * 2 + 3.14) * 0.8,
  );

  // Calculate distances and assign colors
  const sphere1 = Shape({
    dist: sdSphere(std.sub(localP, sphere1Offset), 0.5),
    color: d.vec3f(0.4, 0.5, 1),
  });
  const sphere2 = Shape({
    dist: sdSphere(std.sub(localP, sphere2Offset), 0.3),
    color: d.vec3f(1, 0.8, 0.2),
  });
  const box = Shape({
    dist: sdBoxFrame3d(rotatedP, boxSize, 0.1),
    color: d.vec3f(1.0, 0.3, 0.3),
  });

  // Smoothly blend shapes and colors
  const spheres = smoothShapeUnion(sphere1, sphere2, 0.1);
  return smoothShapeUnion(spheres, box, 0.2);
});

const getSceneDist = tgpu.fn([d.vec3f], Shape)((p) => {
  const shape = getMorphingShape(p, time.$);
  const floor = Shape({
    dist: sdPlane(p, d.vec3f(0, 1, 0), 0),
    color: std.mix(
      d.vec3f(1),
      d.vec3f(0.2),
      checkerBoard(std.mul(p.xz, 2)),
    ),
  });

  return shapeUnion(shape, floor);
});

const rayMarch = tgpu.fn([d.vec3f, d.vec3f], Shape)((ro, rd) => {
  let dO = d.f32(0);
  const result = Shape({
    dist: d.f32(MAX_DIST),
    color: d.vec3f(0, 0, 0),
  });

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(ro, std.mul(rd, dO));
    const scene = getSceneDist(p);
    dO += scene.dist;

    if (dO > MAX_DIST || scene.dist < SURF_DIST) {
      result.dist = dO;
      result.color = scene.color;
      break;
    }
  }

  return result;
});

const softShadow = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.f32, d.f32],
  d.f32,
)((ro, rd, minT, maxT, k) => {
  let res = d.f32(1);
  let t = minT;

  for (let i = 0; i < 100; i++) {
    if (t >= maxT) break;
    const h = getSceneDist(std.add(ro, std.mul(rd, t))).dist;
    if (h < 0.001) return 0;
    res = std.min(res, k * h / t);
    t += std.max(h, 0.001);
  }

  return res;
});

const getNormal = tgpu.fn([d.vec3f], d.vec3f)((p) => {
  const dist = getSceneDist(p).dist;
  const e = 0.01;

  const n = d.vec3f(
    getSceneDist(std.add(p, d.vec3f(e, 0, 0))).dist - dist,
    getSceneDist(std.add(p, d.vec3f(0, e, 0))).dist - dist,
    getSceneDist(std.add(p, d.vec3f(0, 0, e))).dist - dist,
  );

  return std.normalize(n);
});

const getOrbitingLightPos = tgpu.fn([d.f32], d.vec3f)((t) => {
  const radius = d.f32(3);
  const height = d.f32(6);
  const speed = d.f32(1);

  return d.vec3f(
    std.cos(t * speed) * radius,
    height + std.sin(t * speed) * radius,
    4,
  );
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

  // Ray origin and direction
  const ro = d.vec3f(0, 2, 3);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, 1));

  const march = rayMarch(ro, rd);

  const fog = std.pow(std.min(march.dist / MAX_DIST, 1), 0.7);

  const p = std.add(ro, std.mul(rd, march.dist));
  const n = getNormal(p);

  // Lighting with orbiting light
  const lightPos = getOrbitingLightPos(time.$);
  const l = std.normalize(std.sub(lightPos, p));
  const diff = std.max(std.dot(n, l), 0);

  // Soft shadows
  const shadowRo = p;
  const shadowRd = l;
  const shadowDist = std.length(std.sub(lightPos, p));
  const shadow = softShadow(shadowRo, shadowRd, 0.1, shadowDist, 16);

  // Combine lighting with shadows and color
  const litColor = std.mul(march.color, diff);
  const finalColor = std.mix(
    std.mul(litColor, 0.5), // Shadow color
    litColor, // Lit color
    shadow,
  );

  return std.mix(d.vec4f(finalColor, 1), skyColor, fog);
});

const renderPipeline = root['~unstable']
  .withVertex(vertexMain, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

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
  root.destroy();
}
