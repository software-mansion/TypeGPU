import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { sdSphere, sdPlane } from "@typegpu/sdf";

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const context = canvas.getContext("webgpu") as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: "premultiplied",
});

const time = root.createUniform(d.f32);
const resolution = root.createUniform(d.vec2f);

const MAX_STEPS = 1000;
const MAX_DIST = 17;
const SURF_DIST = 0.001;
const SPEED_PER_FRAME = 2;
const GRID_SEP = 1.2;
const GRID_TIGHTNESS = 10;

const skyColor = d.vec4f(0.1, 0, 0.2, 1);
const gridColor = d.vec3f(0.92, 0.21, 0.96);
const gridInnerColor = d.vec3f(0, 0, 0);

const Ray = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const grid = tgpu.fn(
  [d.vec2f],
  d.vec3f,
)((uv) => {
  const uv_mod = std.fract(
    std.div(d.vec2f(uv.x, uv.y + SPEED_PER_FRAME * time.$), GRID_SEP),
  );

  const uv_closest = std.min(std.abs(std.add(-1, uv_mod)), uv_mod);

  const d_better = std.min(uv_closest.x, uv_closest.y);

  return std.mix(
    gridInnerColor,
    gridColor,
    std.exp(-GRID_TIGHTNESS * d_better), // fading color
  );
});

const getBall = tgpu.fn(
  [d.vec3f, d.f32],
  Ray,
)((p, t) => {
  // Center position
  const center = d.vec3f(0, 4, 12); // hardcoded
  const localP = std.sub(p, center); // way from center to p

  // Okay some periodic pattern let it be
  const sphere1Offset = d.vec3f(
    std.cos(t * 2) * 4, // x
    std.sin(t * 7) * 3,
    std.sin(t * 2) * 2, // z
  );

  // Calculate distances and assign colors
  return Ray({
    dist: sdSphere(std.sub(localP, sphere1Offset), 1), // center is relative to p
    color: d.vec3f(0.87, 0.22, 0.46),
  });
});

const shapeUnion = tgpu.fn(
  [Ray, Ray],
  Ray,
)((a, b) => ({
  color: std.select(a.color, b.color, a.dist > b.dist),
  dist: std.min(a.dist, b.dist),
}));

// Should return min distance to some world object
const getSceneDist = tgpu.fn(
  [d.vec3f],
  Ray,
)((p) => {
  const floor = Ray({
    dist: sdPlane(p, d.vec3f(0, 1, 0), 1),
    color: grid(p.xz),
  });
  const ball = getBall(p, time.$);

  return shapeUnion(floor, ball);
});

const rayMarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  Ray,
)((ro, rd) => {
  let dO = d.f32(0);
  const result = Ray({
    dist: d.f32(MAX_DIST),
    color: d.vec3f(0, 1, 0),
  });

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(ro, std.mul(rd, dO));
    const scene = getSceneDist(p);
    dO += scene.dist;

    if (dO > MAX_DIST) {
      result.dist = MAX_DIST;
      result.color = d.vec3f(0, 1, 0); // green for debug
      break;
    }

    if (scene.dist < SURF_DIST) {
      result.dist = dO;
      result.color = scene.color;
      break;
    }
  }

  return result;
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

  // Ray origin and direction
  const ro = d.vec3f(0, 2, 3);
  const rd = std.normalize(d.vec3f(uv.x, uv.y, 1));

  // Marching
  const march = rayMarch(ro, rd);

  // Cool fog calculations
  const fog = std.min(march.dist / MAX_DIST, 1);

  return std.mix(d.vec4f(march.color, 1), skyColor, fog);
});

const renderPipeline = root["~unstable"]
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

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  root.destroy();
}
