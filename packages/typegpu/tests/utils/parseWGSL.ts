import { parse } from '@typegpu/wgsl-parser';
import { StrictNameRegistry, type Tgpu } from '../../src/experimental';
import { ResolutionCtxImpl } from '../../src/resolutionCtx';

export function parseWGSL(segment: Tgpu) {
  const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

  const resolved = ctx.resolve(segment);

  try {
    return parse(resolved);
  } catch (e) {
    throw new Error(
      `Failed to parse the following: \n${resolved}\n\nCause:${String(e).substring(0, 128)}`,
    );
  }
}
