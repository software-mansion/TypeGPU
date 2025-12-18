import * as d from 'typegpu/data';

export const WIDTH = 128;
// Water size in system units.
export const BOUNDS = 6;
export const BOUNDS_HALF = BOUNDS * 0.5;
export const limit = BOUNDS_HALF - 0.2;

export const waterMaxHeight = 0.1;

export const NeighborIndices = d.struct({
  northIndex: d.u32,
  southIndex: d.u32,
  eastIndex: d.u32,
  westIndex: d.u32,
});

export const Normals = d.struct({
  normalX: d.f32,
  normalY: d.f32,
});
