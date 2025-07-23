import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";
import { sdPlane } from "@typegpu/sdf";

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
const MAX_DIST = 30;
const SURF_DIST = 0.001;
const SPEED_PER_FRAME = 7;
const GRID_SEP = 1.5;
const GRID_TIGHTNESS = 10;

// const skyColor = d.vec4f(0.9, 0.21, 0.53, 1);
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
  const uv_closest_int = std.abs(
    std.add(
      std.fract(
        std.div(d.vec2f(uv.x, uv.y + SPEED_PER_FRAME * time.$), GRID_SEP),
      ),
      -0.5, // visual shift
    ),
  );
  const d_better = std.min(uv_closest_int.x, uv_closest_int.y);

  return std.mix(
    gridInnerColor,
    gridColor,
    std.exp(-GRID_TIGHTNESS * d_better), // fading color
  );
});

const getSceneDist = tgpu.fn(
  [d.vec3f],
  Ray,
)((p) => {
  const floor = Ray({
    dist: sdPlane(p, d.vec3f(0, 1, 0), 0),
    color: grid(p.xz),
  });

  return floor;
});

const rayMarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  Ray,
)((ro, rd) => {
  let dO = d.f32(0);
  const result = Ray({
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

  // Weird fog calculations
  const fog = std.pow(std.min(march.dist / MAX_DIST, 1), 0.7);

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
