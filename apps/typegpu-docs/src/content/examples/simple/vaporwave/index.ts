import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { sdSphere, sdPlane } from "@typegpu/sdf";
import { perlin3d } from "@typegpu/noise";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const context = canvas.getContext("webgpu") as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init({
  device: { requiredFeatures: ["timestamp-query"] },
});

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: "premultiplied",
});

const time = root.createUniform(d.f32);
const resolution = root.createUniform(d.vec2f);

const MAX_STEPS = 1000;
const MAX_DIST = 19;
const SURF_DIST = 0.001;
const GRID_SEP = 1.2;
const GRID_TIGHTNESS = 7;

const skyColor = d.vec4f(0.1, 0, 0.2, 1);
const gridColor = d.vec3f(0.92, 0.21, 0.96);
const gridInnerColor = d.vec3f(0, 0, 0);
const ballCenter = d.vec3f(0, 6, 12);

let ballColor = d.vec3f(0, 0.25, 1);
let speedPerFrame = 11;

const Ray = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const ballColorBuf = root.createUniform(d.vec3f);
ballColorBuf.write(ballColor);
const speedPerFrameBuf = root.createUniform(d.f32);
speedPerFrameBuf.write(speedPerFrame);

// this will be placed in slot
const grid = tgpu.fn(
  [d.vec2f],
  d.vec3f,
)((uv) => {
  const uv_mod = std.fract(
    std.div(d.vec2f(uv.x, uv.y + speedPerFrameBuf.$ * time.$), GRID_SEP),
  );

  // x^4 + y^4 = 0.5^4
  const diff_4 = std.pow(std.sub(d.vec2f(0.5, 0.5), uv_mod), d.vec2f(4, 4));
  const sdf = std.pow(diff_4.x + diff_4.y, 0.25) - 0.5; // - radius

  return std.mix(
    gridInnerColor,
    gridColor,
    std.exp(GRID_TIGHTNESS * sdf), // fading color
  );
});

const circles = tgpu.fn(
  [d.vec2f],
  d.vec3f,
)((uv) => {
  const rotMatY = d.mat4x4f.rotationY((-time.$ * speedPerFrameBuf.$) / 10); // 10 is empirical
  const uv_rotated = std.mul(
    rotMatY,
    std.add(d.vec4f(uv.x, 1.0, uv.y, 1), d.vec4f(0, 0, -ballCenter.z, 0)),
  );

  const uv_mod = std.fract(
    std.div(d.vec2f(uv_rotated.x, uv_rotated.z), GRID_SEP),
  );

  const diff_2 = std.pow(std.sub(d.vec2f(0.5, 0.5), uv_mod), d.vec2f(2, 2));
  const dist = std.pow(diff_2.x + diff_2.y, 0.5);

  return std.mix(
    gridInnerColor,
    gridColor,
    std.exp(d.f32(-5) * dist), // fading color
  );
});

const getBall = tgpu.fn(
  [d.vec3f, d.f32],
  Ray,
)((p, t) => {
  const localP = std.sub(p, ballCenter); // (0,0) is the center to rotate easily
  const rotMatZ = d.mat4x4f.rotationZ(-t * 0.3);
  const rotMatX = d.mat4x4f.rotationX(-t * 0.7);
  const rotatedP = std.mul(rotMatZ, std.mul(rotMatX, d.vec4f(localP, 1))).xyz;

  // breathing effect
  const radius = 3 + std.sin(t);

  // perlin noise
  const noise = perlin3d.sample(std.add(rotatedP, t));

  // calculate distances and assign colors
  return Ray({
    dist: sdSphere(rotatedP, radius) + noise, // center is relative to p
    color: ballColorBuf.$,
  });
});

const shapeUnion = tgpu.fn(
  [Ray, Ray],
  Ray,
)((a, b) => ({
  color: std.select(a.color, b.color, a.dist > b.dist),
  dist: std.min(a.dist, b.dist),
}));

const floorPatternSlot = tgpu.slot(grid);

// should return min distance to some world object
const getSceneDist = tgpu.fn(
  [d.vec3f],
  Ray,
)((p) => {
  const floor = Ray({
    dist: sdPlane(p, d.vec3f(0, 1, 0), 1), // hardcoded plane location
    color: floorPatternSlot.$(p.xz),
  });
  const ball = getBall(p, time.$);

  return shapeUnion(floor, ball);
});

const rayMarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.struct({ ray: Ray, bloom: d.vec3f }),
)((ro, rd) => {
  let dO = d.f32(0);
  const result = Ray({
    dist: d.f32(MAX_DIST),
    color: d.vec3f(0, 1, 0), // green for debug
  });

  let bloom = d.vec3f(0, 0, 0);

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(ro, std.mul(rd, dO));
    const scene = getSceneDist(p);
    const ballDist = getBall(p, time.$);
    bloom = std.add(bloom, std.mul(ballColorBuf.$, std.exp(-ballDist.dist)));
    dO += scene.dist;

    if (dO > MAX_DIST) {
      result.dist = MAX_DIST;
      result.color = d.vec3f(0, 1, 0); // also green for debug
      break;
    }

    if (scene.dist < SURF_DIST) {
      result.dist = dO;
      result.color = scene.color;
      break;
    }
  }

  return { ray: result, bloom };
});

const vertexMain = tgpu["~unstable"].vertexFn({
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

const fragmentMain = tgpu["~unstable"].fragmentFn({
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

  // fog calculations
  const fog = std.min(march.ray.dist / MAX_DIST, 1);

  return std.mix(
    d.vec4f(march.bloom, 1),
    std.mix(d.vec4f(march.ray.color, 1), skyColor, fog),
    0.87, // this should not be hardcoded
  );
});

const perlinCache = perlin3d.staticCache({
  root: root,
  size: d.vec3u(64),
});

let renderPipeline = root["~unstable"]
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
      loadOp: "clear",
      storeOp: "store",
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
  "sphere color": {
    initial: [ballColor.x, ballColor.y, ballColor.z] as const,
    onColorChange: (value: readonly [number, number, number]) => {
      ballColor = d.vec3f(value[0], value[1], value[2]);
      ballColorBuf.write(ballColor);
    },
  },
  "floor pattern": {
    initial: "circles",
    options: ["grid", "circles"],
    onSelectChange: (value: string) => {
      if (value === "grid") {
        renderPipeline = root["~unstable"]
          .with(floorPatternSlot, grid)
          .pipe(perlinCache.inject())
          .withVertex(vertexMain, {})
          .withFragment(fragmentMain, { format: presentationFormat })
          .createPipeline();
      } else if (value === "circles") {
        renderPipeline = root["~unstable"]
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
