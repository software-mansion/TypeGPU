let GPU_MODE = false;

export function setGPUMode(value: boolean) {
  GPU_MODE = value;
}

export function runOnGPU(callback: () => void) {
  GPU_MODE = true;
  callback();
  GPU_MODE = false;
}

export const inGPUMode = () => GPU_MODE;
