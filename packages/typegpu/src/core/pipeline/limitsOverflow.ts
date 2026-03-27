import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';

export function warnIfOverflow(layouts: TgpuBindGroupLayout[], limits: GPUSupportedLimits) {
  let uniformCount = 0;
  let storageCount = 0;

  for (const layout of layouts) {
    const entries = layout.entries;
    for (const key in layout.entries) {
      const entry = entries[key];
      if (!entry) {
        continue;
      }
      if ('uniform' in entry) {
        uniformCount++;
      }
      if ('storage' in entry) {
        storageCount++;
      }
    }
  }

  if (uniformCount > limits.maxUniformBuffersPerShaderStage) {
    console.warn(
      `Total number of uniform buffers (${uniformCount}) exceeds maxUniformBuffersPerShaderStage (${limits.maxUniformBuffersPerShaderStage}). Consider:
1. Grouping some of the uniforms into one using 'd.struct',
2. Increasing the limit when requesting a device or creating a root.`,
    );
  }

  if (storageCount > limits.maxStorageBuffersPerShaderStage) {
    console.warn(
      `Total number of storage buffers (${storageCount}) exceeds maxStorageBuffersPerShaderStage (${limits.maxStorageBuffersPerShaderStage}).`,
    );
  }
}
