import tgpu, { type TgpuSampledTexture } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mainVertex } from './shaders/vertex';
import {
  ANGLE_DISTORTION,
  CLOUD_CORE_DENSITY,
  CLOUD_DENSITY,
  CLOUD_DETALIZATION,
  FLIGHT_SPEED,
  LIGHT_ABSORBTION,
  MARCH_SIZE,
  MAX_ITERATIONS,
  SUN_DIRECTION,
  SUN_INTENSITY,
} from './consts';

// Boilerplate similar to other rendering examples (no React)
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();
const device = root.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Uniforms
const time = root.createUniform(d.f32, 0);
const w = root.createUniform(d.f32, canvas.width);
const h = root.createUniform(d.f32, canvas.height);

// Generate a procedural 2D noise texture on the fly (avoids external fetch)
const NOISE_SIZE = 256;
const noiseData = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
for (let i = 0; i < noiseData.length; i += 4) {
  // Two independent noise channels in R & G, keep B same as R for slight correlation; A=255
  const r = Math.random() * 255;
  const g = Math.random() * 255;
  noiseData[i] = r;
  noiseData[i + 1] = g;
  noiseData[i + 2] = r;
  noiseData[i + 3] = 255;
}

const imageTexture = root['~unstable']
  .createTexture({ size: [NOISE_SIZE, NOISE_SIZE], format: 'rgba8unorm' })
  .$usage('sampled', 'render');

device.queue.writeTexture(
  { texture: root.unwrap(imageTexture) },
  noiseData,
  { bytesPerRow: NOISE_SIZE * 4 },
  { width: NOISE_SIZE, height: NOISE_SIZE },
);

  const sampledView = imageTexture.createView('sampled') as TgpuSampledTexture<'2d', d.F32>;
  const sampler = tgpu['~unstable'].sampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const noise = tgpu.fn(
    [d.vec3f],
    d.f32,
  )((x) => {
    const p = std.floor(x);
    let f = std.fract(x);

    f = std.mul(std.mul(f, f), std.sub(3.0, std.mul(2.0, f)));

    const uv = std.add(
      std.add(p.xy, std.mul(d.vec2f(37.0, 239.0), d.vec2f(p.z, p.z))),
      f.xy,
    );
    const tex = std.textureSampleLevel(
      sampledView,
      sampler,
      std.fract(std.div(std.add(uv, d.vec2f(0.5, 0.5)), 256.0)),
      0.0,
    ).yx;

    return std.mix(tex.x, tex.y, f.z) * 2.0 - 1.0;
  }).$uses({ sampledView, sampler });

  const fbm = tgpu.fn(
    [d.vec3f],
    d.f32,
  )((p) => {
    let q = std.add(
      p,
      d.vec3f(std.sin(time.$), std.cos(time.$), time.$ * FLIGHT_SPEED),
    );
    let f = d.f32(0.0);
    let scale = d.f32(CLOUD_CORE_DENSITY);
    let factor = d.f32(CLOUD_DETALIZATION);

    for (let i = 0; i < 4; i++) {
      f += noise(q) * scale;
      q = std.mul(q, factor);
      scale *= 0.4;
      factor += 0.5;
    }
    return f;
  }).$uses({ time });

  const scene = tgpu.fn(
    [d.vec3f],
    d.f32,
  )((p) => {
    const f = fbm(p);
    return f - 1.5 + CLOUD_DENSITY * 2.0;
  });

  const raymarch = tgpu.fn(
    [d.vec3f, d.vec3f, d.vec3f],
    d.vec4f,
  )((ro, rd, sunDirection) => {
    let res = d.vec4f(0.0, 0.0, 0.0, 0.0);
    const transparency = 0.0;
    const hash = std.fract(
      std.sin(std.dot(rd.xy, d.vec2f(12.9898, 78.233))) * 43758.5453,
    );
    let depth = hash * MARCH_SIZE;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const p = std.add(ro, std.mul(rd, depth));
      const density = std.clamp(scene(p), 0.0, 1.0);
      if (density > 0.0) {
        let diffuse = std.clamp(
          scene(p) - scene(std.add(p, sunDirection)),
          0.0,
          1.0,
        );
        diffuse = std.mix(0.3, 1.0, diffuse);
        const lin = std.add(
          std.mul(d.vec3f(0.6, 0.45, 0.75), 1.1),
          std.mul(d.vec3f(1.0, 0.7, 0.3), diffuse * SUN_INTENSITY),
        );
        let color = d.vec4f(
          std.mix(d.vec3f(1.0, 1.0, 1.0), d.vec3f(0.2, 0.2, 0.2), density),
          density,
        );
        color = d.vec4f(
          color.x * lin.x,
          color.y * lin.y,
          color.z * lin.z,
          color.w,
        );
        color = d.vec4f(
          color.x * color.w,
          color.y * color.w,
          color.z * color.w,
          color.w,
        );
        res = std.add(res, std.mul(color, LIGHT_ABSORBTION - res.w));
      }
      depth += MARCH_SIZE;
    }
    return res;
  });

  const mainFragment = tgpu['~unstable'].fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    {
      let new_uv = std.mul(std.sub(uv, 0.5), 2.0);
      new_uv = d.vec2f(new_uv.x, new_uv.y * (h.$ / w.$));
      const sunDirection = std.normalize(SUN_DIRECTION);
      const ro = d.vec3f(0.0, 0.0, -3.0);
      const rd = std.normalize(d.vec3f(new_uv.x, new_uv.y, ANGLE_DISTORTION));
      const sun = std.clamp(std.dot(rd, sunDirection), 0.0, 1.0);

      let color = d.vec3f(0.75, 0.66, 0.9);

      color = std.sub(color, std.mul(0.35 * rd.y, d.vec3f(1, 0.7, 0.43)));

      color = std.add(
        color,
        std.mul(
          d.vec3f(1.0, 0.37, 0.17),
          std.pow(sun, 1.0 / std.pow(SUN_INTENSITY, 3.0)),
        ),
      );

      const res = raymarch(ro, rd, sunDirection);

      color = std.add(std.mul(color, 1.1 - res.w), res.xyz);

      return d.vec4f(color, 1.0);
    }
  });

  const pipeline = root['~unstable']
    .withVertex(mainVertex, {})
    .withFragment(mainFragment, { format: presentationFormat })
    .createPipeline();

// Animation loop
let frameId: number;
function render() {
  w.write(canvas.width);
  h.write(canvas.height);
  time.write((performance.now() / 1000) % 500);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(6);

  frameId = requestAnimationFrame(render);
}

frameId = requestAnimationFrame(render);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}
