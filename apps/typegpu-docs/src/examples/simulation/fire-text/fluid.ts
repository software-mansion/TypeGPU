import { d, std, tgpu } from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import {
  constantSourceLayout,
  divergenceLayout,
  pressureLayout,
  smokeLayout,
  sourceLayout,
} from './layouts.ts';
import {
  AdvectionParams,
  brushAccess,
  brushModes,
  clockAccess,
  defaults,
  ForceParams,
} from './params.ts';
import { brushFalloff } from './utils.ts';

export const advectionAccess = tgpu.accessor(AdvectionParams);
export const insidePressureAccess = tgpu.accessor(d.f32);
export const forceAccess = tgpu.accessor(ForceParams);

const CONSTANT_BRUSH = brushModes.indexOf('Constant Source');

const LEFT = d.vec2i(-1, 0);
const RIGHT = d.vec2i(1, 0);
const UP = d.vec2i(0, -1);
const DOWN = d.vec2i(0, 1);
const CROSS = tgpu.const(d.arrayOf(d.vec2i, 4), [LEFT, RIGHT, UP, DOWN]);

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
  const s = advectionAccess.$;
  const c = clockAccess.$;
  const b = brushAccess.$;
  const pos = gid.xy;
  const size = d.vec2f(std.textureDimensions(smokeLayout.$.inTex));
  const uv = (d.vec2f(pos) + 0.5) / size;

  const flow = std.textureLoad(smokeLayout.$.inTex, pos, 0).xy;
  const state = std.textureSampleLevel(
    smokeLayout.$.inTex,
    smokeLayout.$.linearSampler,
    uv - (flow * c.dt) / size,
    0,
  );

  const emitted = std.textureLoad(sourceLayout.$.tex, pos, 0).x;
  const printed = std.textureLoad(smokeLayout.$.textTex, pos, 0).x;
  let velocity = d.vec2f(state.xy);
  let density = std.max(state.z, std.max(emitted, printed));
  let heat = std.max(state.w, std.max(emitted, printed * defaults.textStartTemperature));

  if (s.isMouseDown === 1 && s.brushMode !== CONSTANT_BRUSH) {
    const weight = brushFalloff(
      std.distance(d.vec2f(pos), d.vec2f(b.stampPos)),
      b.radius,
      b.isSoft,
      0.1,
    );
    velocity += s.mouseVelocity * weight * 0.15;
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
  const c = clockAccess.$;
  const f = forceAccess.$;
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

  const noise = perlin3d.sample(d.vec3f((d.vec2f(coord) + 0.5) * 0.02, c.time));
  const force =
    swirl(eta, curl) * f.vorticityStrength +
    swirl(heatGradient, curl) * f.thermalStrength +
    d.vec2f(noise * 40 * state.w, -f.buoyancy * state.w);

  let velocity = state.xy + force * c.dt;
  const speed = std.length(velocity);
  if (speed > 1000) {
    velocity = (velocity / speed) * 1000;
  }

  std.textureStore(smokeLayout.$.outTex, pos, d.vec4f(velocity, state.z, state.w));
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

  const fill = std.textureLoad(divergenceLayout.$.textTex, pos, 0).x;

  std.textureStore(
    divergenceLayout.$.divTex,
    pos,
    d.vec4f(div * 0.5 - fill * insidePressureAccess.$),
  );

  // clearing texture for pressure solver
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
  let velocity = d.vec2f(state.xy - gradient * 0.5);
  if (coord.x === 0 || coord.x === size.x - 1) {
    velocity.x = 0;
  }
  if (coord.y === 0 || coord.y === size.y - 1) {
    velocity.y = 0;
  }

  std.textureStore(smokeLayout.$.outTex, pos, d.vec4f(velocity, state.z, state.w));
});

export const stamp = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const b = brushAccess.$;
  const radius = d.i32(b.radius); // przemyslec wszedzie te casty, sporo jest ich niepotrzebnych.
  const delta = d.vec2i(gid.xy) - radius;
  const pixel = d.vec2i(b.stampPos) + delta;
  const dist = std.length(d.vec2f(delta));
  const texSize = d.i32(std.textureDimensions(constantSourceLayout.$.tex).x);

  if (pixel.x >= 0 && pixel.x < texSize && pixel.y >= 0 && pixel.y < texSize) {
    const weight = brushFalloff(dist, b.radius, b.isSoft, 0.05);
    if (weight > 0) {
      const old = std.textureLoad(constantSourceLayout.$.tex, pixel).x;
      std.textureStore(constantSourceLayout.$.tex, pixel, d.vec4f(std.max(old, weight)));
    }
  }
});
