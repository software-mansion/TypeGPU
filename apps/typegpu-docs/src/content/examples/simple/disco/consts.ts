import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const dimensionsSlot = tgpu.slot<{ w: number; h: number }>();
export const timeAccess = tgpu['~unstable'].accessor(d.f32);
