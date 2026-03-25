import { d } from 'typegpu';
import type { SimulationParams } from './types.ts';

export const N = 2048;
export const SIM_N = N / 4;
export const [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y] = [16, 16];
export const FORCE_SCALE = 1;
export const RADIUS = SIM_N / 16;
export const INK_AMOUNT = 0.02;

export const params: SimulationParams = {
  dt: 0.5,
  viscosity: 0.000001,
  jacobiIter: 10,
  displayMode: 'image',
  paused: false,
};

export const BrushParams = d.struct({
  pos: d.vec2i,
  delta: d.vec2f,
  radius: d.f32,
  forceScale: d.f32,
  inkAmount: d.f32,
});

export const ShaderParams = d.struct({
  dt: d.f32,
  viscosity: d.f32,
});
