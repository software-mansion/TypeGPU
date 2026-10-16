import { sdLine } from '@typegpu/sdf';
import { d, std, tgpu } from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import {
  constantSourceLayout,
  divergenceLayout,
  pressureLayout,
  smokeLayout,
  sourceLayout,
} from './layouts.ts';
import { brush, sim } from './params.ts';

const LEFT = d.vec2i(-1, 0);
const RIGHT = d.vec2i(1, 0);
const UP = d.vec2i(0, -1);
const DOWN = d.vec2i(0, 1);
const CROSS = tgpu.const(d.arrayOf(d.vec2i, 4), [LEFT, RIGHT, UP, DOWN]);

const brushDistance = (pos: d.v2f, start: d.v2f, end: d.v2f) => {
  'use gpu';
  if (std.allEq(start, end)) {
    return std.distance(pos, start);
  }
  return sdLine(pos, start, end);
};

const SOFT_FALLOFF_INNER = 0.05;

const brushWeight = (pos: d.v2f) => {
  'use gpu';
  const b = brush.$;
  const dist = brushDistance(pos, b.oldStampPos, b.newStampPos);
  if (dist > b.radius) {
    return d.f32(0);
  }
  if (b.isSoft === 1) {
    return 1 - std.smoothstep(b.radius * SOFT_FALLOFF_INNER, b.radius, dist);
  }
  return d.f32(1);
};

const velocityAt = (coord: d.v2i, size: d.v2i) => {
  'use gpu';
  return std.textureLoad(smokeLayout.$.inTex, std.clamp(coord, d.vec2i(0), size - 1), 0).xy;
};

const heatAt = (coord: d.v2i) => {
  'use gpu';
  return std.textureLoad(smokeLayout.$.inTex, coord, 0).w;
};

const pressureAt = (coord: d.v2i, size: d.v2i) => {
  'use gpu';
  return std.textureLoad(pressureLayout.$.inTex, std.clamp(coord, d.vec2i(0), size - 1)).x;
};

const curlAt = (coord: d.v2i, size: d.v2i) => {
  'use gpu';
  const dvy = velocityAt(coord + RIGHT, size).y - velocityAt(coord + LEFT, size).y;
  const dvx = velocityAt(coord + DOWN, size).x - velocityAt(coord + UP, size).x;
  return 0.5 * (dvy - dvx);
};

const swirl = (dir: d.v2f, curl: number) => {
  'use gpu';
  const len = std.length(dir);
  if (len <= 0.0001) {
    return d.vec2f();
  }
  const n = dir / len;
  return d.vec2f(n.y * curl, -n.x * curl);
};

export const advection = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const s = sim.$;
  const b = brush.$;
  const pos = gid.xy;
  const size = d.vec2f(std.textureDimensions(smokeLayout.$.inTex));
  const uv = (d.vec2f(pos) + 0.5) / size;

  const flow = std.textureLoad(smokeLayout.$.inTex, pos, 0).xy;
  const state = std.textureSampleLevel(
    smokeLayout.$.inTex,
    smokeLayout.$.linearSampler,
    uv - (flow * s.dt) / size,
    0,
  );

  const emitted = std.textureLoad(sourceLayout.$.tex, pos, 0).x;
  const mask = std.textureLoad(smokeLayout.$.textTex, pos, 0).xy;
  let printed = mask.x;
  if (s.cursorBlink === 1 && (s.time - s.caretBlinkStart) % 1.6 < 0.8) {
    // Match the canvas rectangle's coverage, including partially covered texels.
    const texel = d.vec2f(pos);
    const coverage = std.max(
      std.min(texel + 1, s.caretRect.zw) - std.max(texel, s.caretRect.xy),
      d.vec2f(),
    );
    printed = std.max(printed, coverage.x * coverage.y * (1 - mask.y));
  }
  let velocity = state.xy;
  let density = std.max(state.z, std.max(emitted, printed));
  let heat = std.max(state.w, std.max(emitted, printed));

  if (b.isBrushing === 1) {
    const weight = brushWeight(d.vec2f(pos) + 0.5);
    velocity += b.mouseVelocity * weight * 0.15;
    density = std.max(density, weight);
    heat = std.max(heat, weight);
  }

  std.textureStore(
    smokeLayout.$.outTex,
    pos,
    d.vec4f(velocity, density * s.densityDecay, heat * s.tempDecay),
  );
});

export const vorticity = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const s = sim.$;
  const pos = gid.xy;
  const coord = d.vec2i(pos);
  const size = d.vec2i(std.textureDimensions(smokeLayout.$.inTex));
  const state = std.textureLoad(smokeLayout.$.inTex, pos, 0);

  if (coord.x <= 2 || coord.y <= 2 || coord.x >= size.x - 3 || coord.y >= size.y - 3) {
    std.textureStore(smokeLayout.$.outTex, pos, state);
    return;
  }

  const curl = curlAt(coord, size);
  const eta =
    d.vec2f(
      std.abs(curlAt(coord + RIGHT, size)) - std.abs(curlAt(coord + LEFT, size)),
      std.abs(curlAt(coord + DOWN, size)) - std.abs(curlAt(coord + UP, size)),
    ) * 0.5;
  const heatGradient =
    d.vec2f(
      heatAt(coord + RIGHT) - heatAt(coord + LEFT),
      heatAt(coord + DOWN) - heatAt(coord + UP),
    ) * 0.5;

  const noise = perlin3d.sample(d.vec3f((d.vec2f(coord) + 0.5) * 0.02, s.time));
  const force =
    swirl(eta, curl) * s.vorticityStrength * state.w +
    swirl(heatGradient, curl) * s.thermalStrength +
    d.vec2f(noise * 40 * state.w, -s.buoyancy * state.w);

  let velocity = state.xy + force * s.dt;
  const speed = std.length(velocity);
  if (speed > 1000) {
    velocity = (velocity / speed) * 1000;
  }

  std.textureStore(smokeLayout.$.outTex, pos, d.vec4f(velocity, state.zw));
});

export const divergence = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const pos = gid.xy;
  const coord = d.vec2i(pos);
  const size = d.vec2i(std.textureDimensions(smokeLayout.$.inTex));

  let div = d.f32(0);
  for (const step of tgpu.unroll(CROSS.$)) {
    div += std.dot(d.vec2f(step), velocityAt(coord + step, size));
  }

  const fill = std.textureLoad(divergenceLayout.$.textTex, pos, 0).y;

  std.textureStore(
    divergenceLayout.$.divTex,
    pos,
    d.vec4f(div * 0.5 - fill * sim.$.textInsidePressure),
  );

  // Clear the texture for the pressure solver.
  std.textureStore(divergenceLayout.$.pressureTex, pos, d.vec4f());
});

export const pressureJacobi = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const pos = gid.xy;
  const coord = d.vec2i(pos);
  const size = d.vec2i(std.textureDimensions(pressureLayout.$.inTex));

  let sum = d.f32(0);
  for (const step of tgpu.unroll(CROSS.$)) {
    sum += pressureAt(coord + step, size);
  }

  const div = std.textureLoad(pressureLayout.$.divTex, pos, 0).x;
  std.textureStore(pressureLayout.$.outTex, pos, d.vec4f((sum - div) * 0.25));
});

export const gradientSubtraction = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const pos = gid.xy;
  const coord = d.vec2i(pos);
  const size = d.vec2i(std.textureDimensions(pressureLayout.$.inTex));

  let gradient = d.vec2f();
  for (const step of tgpu.unroll(CROSS.$)) {
    gradient += d.vec2f(step) * pressureAt(coord + step, size);
  }

  const state = std.textureLoad(smokeLayout.$.inTex, pos, 0);
  const velocity = state.xy - gradient * 0.5;
  if (coord.x === 0 || coord.x === size.x - 1) {
    velocity.x = 0;
  }
  if (coord.y === 0 || coord.y === size.y - 1) {
    velocity.y = 0;
  }

  std.textureStore(smokeLayout.$.outTex, pos, d.vec4f(velocity, state.zw));
});

export const stamp = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const pixel = gid.xy;
  const texSize = std.textureDimensions(constantSourceLayout.$.tex);
  if (pixel.x >= texSize.x || pixel.y >= texSize.y) {
    return;
  }

  const weight = brushWeight(d.vec2f(pixel) + 0.5);
  if (weight > 0) {
    const old = std.textureLoad(constantSourceLayout.$.tex, pixel).x;
    std.textureStore(constantSourceLayout.$.tex, pixel, d.vec4f(std.max(old, weight)));
  }
});
