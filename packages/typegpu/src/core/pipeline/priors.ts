// GPU objects like query sets cross runtimes as shareable host objects, performanceCallback crosses only if it is a worklet
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
