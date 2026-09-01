export function countDispatches(
  root: { device: GPUDevice },
  sorter: { run(o: { pass: GPUComputePassEncoder }): void },
): number {
  const pass = root.device.createCommandEncoder().beginComputePass();
  const calls = (pass.dispatchWorkgroups as unknown as { mock: { calls: unknown[] } }).mock.calls;
  const before = calls.length;
  sorter.run({ pass });
  return calls.length - before;
}
