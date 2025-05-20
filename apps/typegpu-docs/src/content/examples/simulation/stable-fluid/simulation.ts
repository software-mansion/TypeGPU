import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';

const getNeighbors = tgpu['~unstable'].fn(
  { coords: d.vec2i, bounds: d.vec2i },
  d.arrayOf(d.vec2i, 4),
)(({ coords, bounds }) => {
  const adjacentOffsets = [
    d.vec2i(-1, 0),
    d.vec2i(0, -1),
    d.vec2i(1, 0),
    d.vec2i(0, 1),
  ];
  for (let i = 0; i < 4; i++) {
    adjacentOffsets[i] = std.clamp(
      std.add(coords, adjacentOffsets[i]),
      d.vec2i(),
      std.sub(bounds, d.vec2i(1)),
    );
  }
  return adjacentOffsets;
});

export const brushLayout = tgpu.bindGroupLayout({
  brushParams: { uniform: p.BrushParams },
  forceDst: { storageTexture: 'rgba16float', access: 'writeonly' },
  inkDst: { storageTexture: 'rgba16float', access: 'writeonly' },
});

export const brushFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = input.gid.xy;
  const brushSettings = brushLayout.$.brushParams;

  let forceVec = d.vec2f(0.0);
  let inkAmount = d.f32(0.0);

  const deltaX = d.f32(pixelPos.x) - d.f32(brushSettings.pos.x);
  const deltaY = d.f32(pixelPos.y) - d.f32(brushSettings.pos.y);
  const distSquared = deltaX * deltaX + deltaY * deltaY;
  const radiusSquared = brushSettings.radius * brushSettings.radius;

  if (distSquared < radiusSquared) {
    const brushWeight = std.exp(-distSquared / radiusSquared);
    forceVec = std.mul(
      brushSettings.forceScale * brushWeight,
      brushSettings.delta,
    );
    inkAmount = brushSettings.inkAmount * brushWeight;
  }

  std.textureStore(
    brushLayout.$.forceDst,
    pixelPos,
    d.vec4f(forceVec, 0.0, 1.0),
  );
  std.textureStore(
    brushLayout.$.inkDst,
    pixelPos,
    d.vec4f(inkAmount, 0.0, 0.0, 1.0),
  );
});

export const addForcesLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rgba16float', access: 'writeonly' },
  force: { texture: 'float' },
  simParams: { uniform: p.ShaderParams },
});

export const addForcesFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = input.gid.xy;
  const currentVel = std.textureLoad(addForcesLayout.$.src, pixelPos, 0).xy;
  const forceVec = std.textureLoad(addForcesLayout.$.force, pixelPos, 0).xy;
  const timeStep = addForcesLayout.$.simParams.dt;
  const newVel = std.add(currentVel, std.mul(timeStep, forceVec));
  std.textureStore(addForcesLayout.$.dst, pixelPos, d.vec4f(newVel, 0, 1));
});

export const advectLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rgba16float', access: 'writeonly' },
  simParams: { uniform: p.ShaderParams },
  linSampler: { sampler: 'filtering' },
});

export const advectFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const texSize = std.textureDimensions(advectLayout.$.src);
  const pixelPos = input.gid.xy;

  if (
    pixelPos.x >= texSize.x - 1 || pixelPos.y >= texSize.y - 1 ||
    pixelPos.x <= 0 || pixelPos.y <= 0
  ) {
    std.textureStore(advectLayout.$.dst, pixelPos, d.vec4f(0, 0, 0, 1));
    return;
  }

  const velocity = std.textureLoad(advectLayout.$.src, pixelPos, 0);
  const timeStep = advectLayout.$.simParams.dt;
  const prevPos = std.sub(d.vec2f(pixelPos), std.mul(timeStep, velocity.xy));
  const clampedPos = std.clamp(
    prevPos,
    d.vec2f(-0.5),
    d.vec2f(std.sub(d.vec2f(texSize.xy), d.vec2f(0.5))),
  );
  const normalizedPos = std.div(
    std.add(clampedPos, d.vec2f(0.5)),
    d.vec2f(texSize.xy),
  );

  const prevVelocity = std.textureSampleLevel(
    advectLayout.$.src,
    advectLayout.$.linSampler,
    normalizedPos,
    0,
  );

  std.textureStore(advectLayout.$.dst, pixelPos, prevVelocity);
});

export const diffusionLayout = tgpu.bindGroupLayout({
  in: { texture: 'float' },
  out: { storageTexture: 'rgba16float', access: 'writeonly' },
  simParams: { uniform: p.ShaderParams },
});

export const diffusionFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(
    std.textureDimensions(diffusionLayout.$.in),
  );
  const centerVal = std.textureLoad(diffusionLayout.$.in, pixelPos, 0);

  const neighbors = getNeighbors({ coords: pixelPos, bounds: texSize });

  const leftVal = std.textureLoad(diffusionLayout.$.in, neighbors[0], 0);
  const upVal = std.textureLoad(diffusionLayout.$.in, neighbors[1], 0);
  const rightVal = std.textureLoad(diffusionLayout.$.in, neighbors[2], 0);
  const downVal = std.textureLoad(diffusionLayout.$.in, neighbors[3], 0);

  const timeStep = diffusionLayout.$.simParams.dt;
  const viscosity = diffusionLayout.$.simParams.viscosity;

  const diffuseRate = viscosity * timeStep;
  const blendFactor = 1.0 / (4.0 + diffuseRate);
  const diffusedVal = std.mul(
    d.vec4f(blendFactor),
    std.add(
      std.add(std.add(leftVal, rightVal), std.add(upVal, downVal)),
      std.mul(d.f32(diffuseRate), centerVal),
    ),
  );

  std.textureStore(diffusionLayout.$.out, pixelPos, diffusedVal);
});

export const divergenceLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  div: { storageTexture: 'rgba16float', access: 'writeonly' },
});

export const divergenceFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(
    std.textureDimensions(divergenceLayout.$.vel),
  );

  const neighbors = getNeighbors({ coords: pixelPos, bounds: texSize });

  const leftVel = std.textureLoad(divergenceLayout.$.vel, neighbors[0], 0);
  const upVel = std.textureLoad(divergenceLayout.$.vel, neighbors[1], 0);
  const rightVel = std.textureLoad(divergenceLayout.$.vel, neighbors[2], 0);
  const downVel = std.textureLoad(divergenceLayout.$.vel, neighbors[3], 0);

  const divergence = 0.5 *
    (rightVel.x - leftVel.x + (downVel.y - upVel.y));
  std.textureStore(
    divergenceLayout.$.div,
    pixelPos,
    d.vec4f(divergence, 0, 0, 1),
  );
});

export const pressureLayout = tgpu.bindGroupLayout({
  x: { texture: 'float' },
  b: { texture: 'float' },
  out: { storageTexture: 'rgba16float', access: 'writeonly' },
});

export const pressureFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(std.textureDimensions(pressureLayout.$.x));

  const neighbors = getNeighbors({ coords: pixelPos, bounds: texSize });

  const leftPressure = std.textureLoad(pressureLayout.$.x, neighbors[0], 0);
  const upPressure = std.textureLoad(pressureLayout.$.x, neighbors[1], 0);
  const rightPressure = std.textureLoad(pressureLayout.$.x, neighbors[2], 0);
  const downPressure = std.textureLoad(pressureLayout.$.x, neighbors[3], 0);

  const divergence = std.textureLoad(pressureLayout.$.b, pixelPos, 0).x;
  const newPressure = d.f32(0.25) *
    (leftPressure.x + rightPressure.x + upPressure.x + downPressure.x -
      divergence);
  std.textureStore(
    pressureLayout.$.out,
    pixelPos,
    d.vec4f(newPressure, 0, 0, 1),
  );
});

export const projectLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  p: { texture: 'float' },
  out: { storageTexture: 'rgba16float', access: 'writeonly' },
});

export const projectFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(std.textureDimensions(projectLayout.$.vel));
  const velocity = std.textureLoad(projectLayout.$.vel, pixelPos, 0);

  const neighbors = getNeighbors({ coords: pixelPos, bounds: texSize });

  const leftPressure = std.textureLoad(projectLayout.$.p, neighbors[0], 0);
  const upPressure = std.textureLoad(projectLayout.$.p, neighbors[1], 0);
  const rightPressure = std.textureLoad(projectLayout.$.p, neighbors[2], 0);
  const downPressure = std.textureLoad(projectLayout.$.p, neighbors[3], 0);

  const pressureGrad = d.vec2f(
    0.5 * (rightPressure.x - leftPressure.x),
    0.5 * (downPressure.x - upPressure.x),
  );
  const projectedVel = std.sub(velocity.xy, pressureGrad);
  std.textureStore(projectLayout.$.out, pixelPos, d.vec4f(projectedVel, 0, 1));
});

export const advectInkLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  src: { texture: 'float' },
  dst: { storageTexture: 'rgba16float', access: 'writeonly' },
  simParams: { uniform: p.ShaderParams },
  linSampler: { sampler: 'filtering' },
});

export const advectInkFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const texSize = std.textureDimensions(advectInkLayout.$.src);
  const pixelPos = input.gid.xy;

  const velocity = std.textureLoad(advectInkLayout.$.vel, pixelPos, 0).xy;
  const timeStep = advectInkLayout.$.simParams.dt;
  const prevPos = std.sub(d.vec2f(pixelPos), std.mul(timeStep, velocity));
  const clampedPos = std.clamp(
    prevPos,
    d.vec2f(-0.5),
    std.sub(d.vec2f(texSize.xy), d.vec2f(0.5)),
  );
  const normalizedPos = std.div(
    std.add(clampedPos, d.vec2f(0.5)),
    d.vec2f(texSize.xy),
  );

  const inkVal = std.textureSampleLevel(
    advectInkLayout.$.src,
    advectInkLayout.$.linSampler,
    normalizedPos,
    0,
  );
  std.textureStore(advectInkLayout.$.dst, pixelPos, inkVal);
});

export const addInkLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rgba16float', access: 'writeonly' },
  add: { texture: 'float' },
});

export const addInkFn = tgpu['~unstable'].computeFn({
  workgroupSize: [p.WORKGROUP_SIZE_X, p.WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = input.gid.xy;
  const addVal = std.textureLoad(addInkLayout.$.add, pixelPos, 0).x;
  const srcVal = std.textureLoad(addInkLayout.$.src, pixelPos, 0).x;
  std.textureStore(
    addInkLayout.$.dst,
    pixelPos,
    d.vec4f(addVal + srcVal, 0, 0, 1),
  );
});
