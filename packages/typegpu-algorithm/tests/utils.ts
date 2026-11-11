import type { MockDevice } from 'typegpu-testing-utility';

export function countDispatches(
  root: { device: GPUDevice },
  instance: { step(pass: GPUComputePassEncoder): void },
): number {
  const pass = root.device.createCommandEncoder().beginComputePass();
  const calls = (pass.dispatchWorkgroups as unknown as { mock: { calls: unknown[] } }).mock.calls;
  const before = calls.length;
  instance.step(pass);
  return calls.length - before;
}

/** How many of the `GPUBuffer`s created on the mock device were destroyed */
export function destroyedBuffers(device: MockDevice): number {
  return device.mock.createBuffer.mock.results.filter(
    (r) => (r.value as { destroy: { mock: { calls: unknown[] } } }).destroy.mock.calls.length > 0,
  ).length;
}

/** WGSL of every shader module created on the mock device */
export function shaderCodes(device: MockDevice): string[] {
  return (
    device.mock.createShaderModule.mock.calls as unknown as [GPUShaderModuleDescriptor][]
  ).map(([descriptor]) => descriptor.code);
}
