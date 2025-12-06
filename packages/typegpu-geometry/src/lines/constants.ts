import tgpu from 'typegpu';
import { f32 } from 'typegpu/data';

export const JOIN_LIMIT = tgpu['~unstable'].const(f32, 0.999);
