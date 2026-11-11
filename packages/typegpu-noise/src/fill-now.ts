import type { TgpuComputePass, TgpuRoot } from 'typegpu';

/**
 * Records `cache.step(pass)` into its own encoder and submits it right away.
 * Only the deprecated cache factories use it; the module API leaves the submit to the caller.
 */
export function fillNow(
  root: TgpuRoot,
  cache: { step(pass: TgpuComputePass | GPUComputePassEncoder): void },
): void {
  const encoder = root.createCommandEncoder();
  const pass = encoder.beginComputePass();
  cache.step(pass);
  pass.end();
  encoder.submit();
}
