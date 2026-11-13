import { d, tgpu } from 'typegpu';
import { Camera } from '../../common/setup-first-person-camera.ts';

export const cameraAccess = tgpu.accessor(Camera);
export const timeAccess = tgpu.accessor(d.u32);
