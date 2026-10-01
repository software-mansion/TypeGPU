import type { ShaderStage } from '../../types.ts';
import { slot } from './slot.ts';

export const shaderStageSlot = slot<ShaderStage | null>(null);

/**
 * When `true`, numeric literals are treated as floats by default, regardless of whether
 * they're whole numbers or not (`1` behaves like `1.0`). Variables initialized with whole numbers
 * (e.g. `let i = 0`) still become integers if their first decisive use requires it
 * (index access, passing into a function expecting an integer, mixing with integers, ...).
 *
 * Can be enabled for a whole root with the `unstable_preferFloatLiterals` init option,
 * or granularly with `.with(tgpu['~unstable'].preferFloatLiterals, true)`.
 */
export const preferFloatLiteralsSlot = slot<boolean>(false).$name('preferFloatLiterals');
