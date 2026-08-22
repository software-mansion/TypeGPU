export function getResolvedWgsl(device: {
  mock: { createShaderModule: { mock: { calls: unknown[][] } } };
}): string {
  return device.mock.createShaderModule.mock.calls
    .map((call) => (call[0] as { code: string }).code)
    .join('\n\n');
}
