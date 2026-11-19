import { d, tgpu } from 'typegpu';
import { Camera } from '../../common/setup-first-person-camera.ts';
import type { Renderer } from './renderer.ts';

export const sceneSlot = tgpu.slot<Renderer['scene']>();
export const cameraAccess = tgpu.accessor(Camera);
export const timeAccess = tgpu.accessor(d.u32);
