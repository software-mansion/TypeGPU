import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout.ts';

export function warnIfOverflow(layouts: TgpuBindGroupLayout[], limits: GPUSupportedLimits) {
  const entries = Object.values(layouts)
    .flatMap((layout) => Object.values(layout.entries))
    .filter((entry) => entry !== null);

  const uniform = entries.filter((entry) => 'uniform' in entry).length;
  const storage = entries.filter((entry) => 'storage' in entry).length;

  if (uniform > limits.maxUniformBuffersPerShaderStage) {
    console.warn(
      `Total number of uniform buffers (${uniform}) exceeds maxUniformBuffersPerShaderStage (${limits.maxUniformBuffersPerShaderStage}). Consider:
1. Grouping some of the uniforms into one using 'd.struct',
2. Increasing the limit when requesting a device or creating a root.`,
    );
  }

  if (storage > limits.maxStorageBuffersPerShaderStage) {
    console.warn(
      `Total number of storage buffers (${storage}) exceeds maxStorageBuffersPerShaderStage (${limits.maxStorageBuffersPerShaderStage}).`,
    );
  }
}
