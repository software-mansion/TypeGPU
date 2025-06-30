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

// Structure to hold both distance and color
const ShapeResult = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const smoothUnionColor = tgpu['~unstable']
  .fn([ShapeResult, ShapeResult, d.f32], ShapeResult)((a, b, k) => {
    const h = std.max(k - std.abs(a.dist - b.dist), 0) / k;
    const m = h * h;

    // Smooth min for distance
    const dist = std.min(a.dist, b.dist) - m * k * (1 / d.f32(4));

    // Blend colors based on relative distances and smoothing
    const weight = m + std.select(0, 1 - m, a.dist > b.dist);
    const color = std.mix(a.color, b.color, weight);

    return { dist, color };
  });

const getMorphingShape = tgpu['~unstable']
  .fn([d.vec3f, d.f32], ShapeResult)((p, t) => {
    // Center position
    const center = d.vec3f(0, 1, 6);
    const localP = std.sub(p, center);

    // Animate shapes
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

    // Calculate distances and assign colors
    const sphere1 = ShapeResult({
      dist: sdf.sdSphere(std.sub(localP, sphere1Offset), 0.5),
      color: d.vec3f(0.4, 1, 0.5),
    });
    const sphere2 = ShapeResult({
      dist: sdf.sdSphere(std.sub(localP, sphere2Offset), 0.3),
      color: d.vec3f(1, 0.8, 0.2),
    });
    const box = ShapeResult({
      dist: sdf.sdBox3d(localP, boxSize),
      color: d.vec3f(0.4, 0.6, 1.0),
    });

    // Smoothly blend shapes and colors
    const spheres = smoothUnionColor(sphere1, sphere2, 0.5);
    return smoothUnionColor(spheres, box, 0.5);
  });

const getSceneDist = tgpu['~unstable']
  .fn([d.vec3f], ShapeResult)((p) => {
    const shape = getMorphingShape(p, time.$);
    const floor = ShapeResult({
      dist: sdf.sdPlane(p, d.vec3f(0, 1, 0), 0),
      color: d.vec3f(1, 1, 1), // White floor
    });

    // TODO: Use regular min for floor to keep it solid white
    return smoothUnionColor(shape, floor, 0.01);
  });

const rayMarch = tgpu['~unstable']
  .fn([d.vec3f, d.vec3f], ShapeResult)((ro, rd) => {
    let dO = d.f32(0);
    const result = ShapeResult({
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

const softShadow = tgpu['~unstable'].fn(
  [d.vec3f, d.vec3f, d.f32, d.f32, d.f32],
  d.f32,
)((ro, rd, minT, maxT, k) => {
  let res = d.f32(1);
  let t = minT;

  for (let i = 0; i < 32; i++) {
    if (t >= maxT) break;
    const h = getSceneDist(std.add(ro, std.mul(rd, t))).dist;
    if (h < 0.001) return 0;
    res = std.min(res, k * h / t);
    t += std.max(h, 0.001);
  }

  return res;
});

const getNormal = tgpu['~unstable'].fn([d.vec3f], d.vec3f)((p) => {
  const dist = getSceneDist(p).dist;
  const e = 0.01;

  const n = d.vec3f(
    getSceneDist(std.add(p, d.vec3f(e, 0, 0))).dist - dist,
    getSceneDist(std.add(p, d.vec3f(0, e, 0))).dist - dist,
    getSceneDist(std.add(p, d.vec3f(0, 0, e))).dist - dist,
  );

  return std.normalize(n);
});

const getOrbitingLightPos = tgpu['~unstable'].fn([d.f32], d.vec3f)((t) => {
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

  const march = rayMarch(ro, rd);

  if (march.dist > MAX_DIST) {
    return d.vec4f(0.7, 0.8, 0.9, 1); // Sky color
  }

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

  return d.vec4f(finalColor, 1);
});

const renderPipeline = root['~unstable']
  .withVertex(vertexMain, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .withPrimitive({ topology: 'triangle-strip' })
  .createPipeline();

let isRunning = true;

function run(timestamp: number) {
  if (!isRunning) return;

  time.write(timestamp / 1000 % 1000);
  resolution.write(d.vec2f(canvas.width, canvas.height));

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(4);

  requestAnimationFrame(run);
}

requestAnimationFrame(run);

export function onCleanup() {
  isRunning = false;
  root.destroy();
}
