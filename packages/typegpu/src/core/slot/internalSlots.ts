import type { ShaderStage } from '../../types.ts';
import { slot } from './slot.ts';

export const shaderStageSlot = slot<ShaderStage | null>(null);
export const parentFunctionNameSlot = slot<string | null>(null);
