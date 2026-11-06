/**
 * Runs a `precompile()` arrow on a recording root and turns its result into JS code
 * for the pruned runtime. Bundled together with the user's arrow by the evaluator,
 * so that it shares the same `typegpu` instance.
 */

import type { TgpuRoot } from 'typegpu';
import { capture, type CaptureOptions } from './capture.ts';
import { emit } from './emit.ts';

export { PrecompileError } from './capture.ts';

export interface SerializeOptions {
  features?: CaptureOptions['features'];
}

export interface SerializeResult {
  /** An expression calling `__tgpuPruneAttach`, to replace the `precompile()` call with */
  code: string;
  warnings: string[];
}

export async function serializePrecompiled(
  fn: (root: TgpuRoot) => unknown,
  options: SerializeOptions = {},
): Promise<SerializeResult> {
  const { artifact, async, warnings } = await capture(fn, { features: options.features });
  return { code: emit(artifact, { async }), warnings };
}
