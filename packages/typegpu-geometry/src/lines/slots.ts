import tgpu from 'typegpu';
import { round } from './joins/round.ts';

export const joinSlot = tgpu.slot(round);
export const startCapSlot = tgpu.slot(round);
export const endCapSlot = tgpu.slot(round);
