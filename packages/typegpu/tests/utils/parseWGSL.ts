import { parse } from '@typegpu/wgsl-parser';
import { StrictNameRegistry, type Wgsl } from '../../src';
import { ResolutionCtxImpl } from '../../src/resolutionCtx';

export function parseWGSL(segment: Wgsl) {
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
