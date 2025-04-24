import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';

const getNeighbors = tgpu['~unstable'].fn(
  { coords: d.vec2i, bounds: d.vec2i },
  d.arrayOf(d.vec2i, 4),
)(({ coords, bounds }) => {
  const res = [d.vec2i(-1, 0), d.vec2i(0, -1), d.vec2i(1, 0), d.vec2i(0, 1)];
  for (let i = 0; i < 4; i++) {
    res[i] = std.clamp(
      std.add(coords, res[i]),
      d.vec2i(0),
      std.sub(bounds, d.vec2i(1)),
    );
  }
  return res;
});

export const brushLayout = tgpu.bindGroupLayout({
  brushParams: { uniform: p.BrushParams },
  forceDst: { storageTexture: 'rg32float', access: 'writeonly' },
  inkDst: { storageTexture: 'r32float', access: 'writeonly' },
});

export const brushFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = input.gid.xy;
  const params = brushLayout.$.brushParams;

  let force = d.vec2f(0.0);
  let ink = d.f32(0.0);

  const dx = d.f32(coords.x) - d.f32(params.pos.x);
  const dy = d.f32(coords.y) - d.f32(params.pos.y);
  const distSq = dx * dx + dy * dy;
  const radiusSq = params.radius * params.radius;

  if (distSq < radiusSq) {
    const weight = std.exp(-distSq / radiusSq);
    force = std.mul(params.forceScale * weight, params.delta);
    ink = params.inkAmount * weight;
  }

  std.textureStore(brushLayout.$.forceDst, coords, d.vec4f(force, 0.0, 1.0));
  std.textureStore(brushLayout.$.inkDst, coords, d.vec4f(ink, 0.0, 0.0, 1.0));
});

export const addForcesLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rg32float', access: 'writeonly' },
  force: { texture: 'float' },
  simParams: { uniform: p.ShaderParams },
});

export const addForcesFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = input.gid.xy;
  const u = std.textureLoad(addForcesLayout.$.src, coords, 0).xy;
  const f = std.textureLoad(addForcesLayout.$.force, coords, 0).xy;
  const dt = addForcesLayout.$.simParams.dt;
  const u2 = std.add(u, std.mul(dt, f));
  std.textureStore(addForcesLayout.$.dst, coords, d.vec4f(u2, 0, 1));
});

export const advectLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rg32float', access: 'writeonly' },
  simParams: { uniform: p.ShaderParams },
  linSampler: { sampler: 'filtering' },
});

export const advectFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const textureDimensions = std.textureDimensions(advectLayout.$.src);
  const coords = input.gid.xy;
  const oldVel = std.textureLoad(advectLayout.$.src, coords, 0);
  const dt = advectLayout.$.simParams.dt;
  const oldCoords = std.sub(d.vec2f(coords), std.mul(dt, oldVel.xy));
  const oldCoordsClamped = std.clamp(
    oldCoords,
    d.vec2f(-0.5),
    d.vec2f(std.sub(d.vec2f(textureDimensions.xy), d.vec2f(0.5))),
  );
  const oldCoordsNormalized = std.div(
    std.add(oldCoordsClamped, d.vec2f(0.5)),
    d.vec2f(textureDimensions.xy),
  );

  const velAtOldCoords = std.textureSampleLevel(
    advectLayout.$.src,
    advectLayout.$.linSampler,
    oldCoordsNormalized,
    0,
  );

  std.textureStore(advectLayout.$.dst, coords, velAtOldCoords);
});

export const diffusionLayout = tgpu.bindGroupLayout({
  in: { texture: 'float' },
  out: { storageTexture: 'rg32float', access: 'writeonly' },
  simParams: { uniform: p.ShaderParams },
});

export const diffusionFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(
    std.textureDimensions(diffusionLayout.$.in),
  );
  const inputValue = std.textureLoad(diffusionLayout.$.in, coords, 0);

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(diffusionLayout.$.in, neighbors[0], 0);
  const up = std.textureLoad(diffusionLayout.$.in, neighbors[1], 0);
  const right = std.textureLoad(diffusionLayout.$.in, neighbors[2], 0);
  const down = std.textureLoad(diffusionLayout.$.in, neighbors[3], 0);

  const dt = diffusionLayout.$.simParams.dt;
  const viscosity = diffusionLayout.$.simParams.viscosity;

  const alpha = viscosity * dt;
  const beta = 1.0 / (4.0 + alpha);
  const newValue = std.mul(
    d.vec4f(beta),
    std.add(
      std.add(std.add(left, right), std.add(up, down)),
      std.mul(d.f32(alpha), inputValue),
    ),
  );

  std.textureStore(diffusionLayout.$.out, coords, newValue);
});

export const divergenceLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  div: { storageTexture: 'r32float', access: 'writeonly' },
});

export const divergenceFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(
    std.textureDimensions(divergenceLayout.$.vel),
  );

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(divergenceLayout.$.vel, neighbors[0], 0);
  const up = std.textureLoad(divergenceLayout.$.vel, neighbors[1], 0);
  const right = std.textureLoad(divergenceLayout.$.vel, neighbors[2], 0);
  const down = std.textureLoad(divergenceLayout.$.vel, neighbors[3], 0);

  const div = d.f32(0.5) * (right.x - left.x + (down.y - up.y));
  std.textureStore(divergenceLayout.$.div, coords, d.vec4f(div, 0, 0, 1));
});

export const pressureLayout = tgpu.bindGroupLayout({
  x: { texture: 'float' },
  b: { texture: 'float' },
  out: { storageTexture: 'r32float', access: 'writeonly' },
});

export const pressureFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(std.textureDimensions(pressureLayout.$.x));

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(pressureLayout.$.x, neighbors[0], 0);
  const up = std.textureLoad(pressureLayout.$.x, neighbors[1], 0);
  const right = std.textureLoad(pressureLayout.$.x, neighbors[2], 0);
  const down = std.textureLoad(pressureLayout.$.x, neighbors[3], 0);

  const div = std.textureLoad(pressureLayout.$.b, coords, 0).x;
  const newP = d.f32(0.25) * (left.x + right.x + up.x + down.x - div);
  std.textureStore(pressureLayout.$.out, coords, d.vec4f(newP, 0, 0, 1));
});

export const projectLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  p: { texture: 'float' },
  out: { storageTexture: 'rg32float', access: 'writeonly' },
});

export const projectFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(std.textureDimensions(projectLayout.$.vel));
  const vel = std.textureLoad(projectLayout.$.vel, coords, 0);

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(projectLayout.$.p, neighbors[0], 0);
  const up = std.textureLoad(projectLayout.$.p, neighbors[1], 0);
  const right = std.textureLoad(projectLayout.$.p, neighbors[2], 0);
  const down = std.textureLoad(projectLayout.$.p, neighbors[3], 0);

  const grad = d.vec2f(0.5 * (right.x - left.x), 0.5 * (down.x - up.x));
  const newVel = std.sub(vel.xy, grad);
  std.textureStore(projectLayout.$.out, coords, d.vec4f(newVel, 0, 1));
});

export const advectInkLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  src: { texture: 'float' },
  dst: { storageTexture: 'r32float', access: 'writeonly' },
  simParams: { uniform: p.ShaderParams },
  linSampler: { sampler: 'filtering' },
});

export const advectInkFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const dims = std.textureDimensions(advectInkLayout.$.src);
  const coords = input.gid.xy;

  const vel = std.textureLoad(advectInkLayout.$.vel, coords, 0).xy;
  const dt = advectInkLayout.$.simParams.dt;
  const oldCoords = std.sub(d.vec2f(coords), std.mul(dt, vel));
  const clamped = std.clamp(
    oldCoords,
    d.vec2f(-0.5),
    std.sub(d.vec2f(dims.xy), d.vec2f(0.5)),
  );
  const uv = std.div(std.add(clamped, d.vec2f(0.5)), d.vec2f(dims.xy));

  const ink = std.textureSampleLevel(
    advectInkLayout.$.src,
    advectInkLayout.$.linSampler,
    uv,
    0,
  );
  std.textureStore(advectInkLayout.$.dst, coords, ink);
});

export const addInkLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'r32float', access: 'writeonly' },
  add: { texture: 'float' },
});

export const addInkFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const c = input.gid.xy;
  const a = std.textureLoad(addInkLayout.$.add, c, 0).x;
  const s = std.textureLoad(addInkLayout.$.src, c, 0).x;
  std.textureStore(addInkLayout.$.dst, c, d.vec4f(a + s, 0, 0, 1));
});
