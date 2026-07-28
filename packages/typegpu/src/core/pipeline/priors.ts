const TRANSFERABLE_PRIORS = new Set([
  'bindGroupLayoutMap',
  'vertexLayoutMap',
  'indexBuffer',
  'stencilReference',
  'timestampWrites',
  'performanceCallback',
]);

export function nonTransferablePriorsOf(priors: object): string[] {
  return Object.keys(priors).filter(
    (key) =>
      !TRANSFERABLE_PRIORS.has(key) && (priors as Record<string, unknown>)[key] !== undefined,
  );
}
