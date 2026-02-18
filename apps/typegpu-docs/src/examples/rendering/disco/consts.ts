import tgpu, { d } from 'typegpu';

export const timeAccess = tgpu.accessor(d.f32);
export const resolutionAccess = tgpu.accessor(d.vec2f); // (width, height)
