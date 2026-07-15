export function getResolvedWgsl(device: {
  mock: { createShaderModule: { mock: { calls: unknown[][] } } };
}): string {
  return device.mock.createShaderModule.mock.calls
    .map((call) => (call[0] as { code: string }).code)
    .join('\n\n');
}

export function getConversionWarnings(warnSpy: { mock: { calls: unknown[][] } }): unknown[][] {
  return warnSpy.mock.calls.filter((call) => String(call[0]).includes('Implicit conversions'));
}
