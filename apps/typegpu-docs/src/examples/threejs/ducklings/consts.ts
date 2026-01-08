import * as d from 'typegpu/data';

// water
export const WIDTH = 256;
export const BOUNDS = 6;
export const BOUNDS_HALF = BOUNDS * 0.5;
export const limit = BOUNDS_HALF - 0.2;

export const waterMaxHeight = 0.1;

// ducklings
export const SPEED = 5.0;
export const NUM_DUCKS = 100;
export const DUCK_STRIDE = 3;
export const Y_OFFSET = -0.04;
export const VERTICAL_RESPONSE_FACTOR = 0.98;
export const WATER_PUSH_FACTOR = 0.015;
export const LINEAR_DAMPING = 0.92;
export const BOUNCE_DAMPING = -0.4;

// controls
export const INITIAL_VISCOSITY = 0.96;
export const INITIAL_MOUSE_SIZE = 0.12;
export const INITIAL_MOUSE_DEEP = 0.2;

//sun
export const SUN_POSITION = [-1, 2.6, 1.4];

// STRUCTS
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
