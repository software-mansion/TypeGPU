import { tgpu, type TgpuRoot } from 'typegpu';

/**
 * A WebGPU root without a device. It never creates GPU resources, it's only used to
 * create pipelines that get resolved to GLSL.
 */
export function createStandInRoot(): TgpuRoot {
  return tgpu.initFromDevice({ device: {} as GPUDevice });
}
