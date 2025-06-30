import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';

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
const MAX_DIST = 500;
const SURF_DIST = 0.01;

const getMorphingShape = tgpu['~unstable']
  .fn([d.vec3f, d.f32], d.f32)((p, t) => {
    // Center position
    const center = d.vec3f(0, 1, 6);
    const localP = std.sub(p, center);

    // Animate shapes
    const sphereRadius = d.f32(1);
    const boxSize = d.vec3f(0.5);

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

    // Calculate distances
    const sphere1 = sdf.sdSphere(
      std.sub(localP, sphere1Offset),
      sphereRadius * 0.5,
    );
    const sphere2 = sdf.sdSphere(
      std.sub(localP, sphere2Offset),
      sphereRadius * 0.3,
    );
    const box = sdf.sdBox3d(localP, boxSize);

    // Smoothly blend between shapes
    const spheres = sdf.opUnion(sphere1, sphere2);
    return sdf.opSmoothUnion(spheres, box, 0.5);
  });

const getSceneDist = tgpu['~unstable'].fn([d.vec3f], d.f32)((p) => {
  const shapeDist = getMorphingShape(p, time.$);
  const floorDist = sdf.sdPlane(p, d.vec3f(0, 1, 0), 0);
  return sdf.opUnion(shapeDist, floorDist);
});

const rayMarch = tgpu['~unstable'].fn([d.vec3f, d.vec3f], d.f32)((ro, rd) => {
  let dO = d.f32(0);

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(ro, std.mul(rd, dO));
    const dS = getSceneDist(p);
    dO += dS;
    if (dO > MAX_DIST || dS < SURF_DIST) break;
  }

  return dO;
});

const softShadow = tgpu['~unstable'].fn(
  [d.vec3f, d.vec3f, d.f32, d.f32, d.f32],
  d.f32,
)((ro, rd, minT, maxT, k) => {
  let res = d.f32(1);
  let t = minT;

  for (let i = 0; i < 32; i++) {
    if (t >= maxT) break;
    const h = getSceneDist(std.add(ro, std.mul(rd, t)));
    if (h < 0.001) return 0;
    res = std.min(res, k * h / t);
    t += std.max(h, 0.001);
  }

  return res;
});

const getNormal = tgpu['~unstable'].fn([d.vec3f], d.vec3f)((p) => {
  const dist = getSceneDist(p);
  const e = 0.01;

  const n = d.vec3f(
    getSceneDist(std.add(p, d.vec3f(e, 0, 0))) - dist,
    getSceneDist(std.add(p, d.vec3f(0, e, 0))) - dist,
    getSceneDist(std.add(p, d.vec3f(0, 0, e))) - dist,
  );

  return std.normalize(n);
});

const getOrbitingLightPos = tgpu['~unstable'].fn([d.f32], d.vec3f)((t) => {
  const radius = d.f32(4);
  const height = d.f32(4);
  const speed = d.f32(1);

  return d.vec3f(
    std.cos(t * speed) * radius,
    height + std.sin(t * speed) * radius,
    6,
  );
});

const vertexMain = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(1, 1), d.vec2f(-1, 1), d.vec2f(1, -1), d.vec2f(-1, -1)];
  const uv = [d.vec2f(1, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(0, 0)];

  return {
    pos: d.vec4f(pos[input.idx].x, pos[input.idx].y, 0.0, 1.0),
    uv: uv[input.idx],
  };
});

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = std.sub(std.mul(input.uv, 2), 1);
  uv.x *= resolution.$.x / resolution.$.y;

  // Ray origin and direction
  const ro = d.vec3f(0, 2, 0);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, 1));

  const dist = rayMarch(ro, rd);

  if (dist > MAX_DIST) {
    return d.vec4f(0.7, 0.8, 0.9, 1); // Sky color
  }

  const p = std.add(ro, std.mul(rd, dist));
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

  // Combine lighting with shadows
  const finalColor = std.mix(
    d.vec3f(diff * 0.5), // Shadow color
    d.vec3f(diff), // Lit color
    shadow,
  );

  return d.vec4f(finalColor.x, finalColor.y, finalColor.z, 1);
});

const renderPipeline = root['~unstable']
  .withVertex(vertexMain, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-strip' })
  .createPipeline();

let disposed = false;

const onFrame = (loop: (deltaTime: number) => unknown) => {
  let lastTime = Date.now();
  const runner = () => {
    if (disposed) {
      return;
    }
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;
    loop(dt);
    requestAnimationFrame(runner);
  };
  requestAnimationFrame(runner);
};

onFrame(() => {
  time.write((Date.now()) / 1000 % 1000);
  resolution.write(d.vec2f(canvas.width, canvas.height));

  const textureView = context.getCurrentTexture().createView();
  renderPipeline
    .withColorAttachment({
      view: textureView,
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(4);
});

export function onCleanup() {
  disposed = true;
  root.destroy();
}
