import tgpu from 'typegpu';
import * as d from 'typegpu/data';

export const timeAccess = tgpu['~unstable'].accessor(d.f32);
export const resolutionAccess = tgpu['~unstable'].accessor(d.vec2f); // (width, height)
