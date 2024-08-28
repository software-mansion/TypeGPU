let gpuDepth = 0;

export function onGPU<T>(callback: () => T): T {
  gpuDepth++;
  try {
    return callback();
  } finally {
    gpuDepth--;
  }
}

export const inGPUMode = () => gpuDepth > 0;
