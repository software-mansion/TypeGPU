import * as d from 'typegpu/data';
import { colors } from './geometry.ts';
import { root } from './root.ts';

const animationProgress = root.createUniform(d.f32);

const shiftedColors = root.createReadonly(d.arrayOf(d.vec4f, 3), [...colors]);

export { animationProgress, shiftedColors };
