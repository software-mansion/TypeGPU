import { parse } from '@typegpu/wgsl-parser';
import { JitTranspiler } from '../../../jit';
import { StrictNameRegistry, type Wgsl } from '../../src/experimental';
import { resolve } from '../../src/resolutionCtx';

export function parseWGSL(segment: Wgsl) {
  const opts = {
    names: new StrictNameRegistry(),
    jitTranspiler: new JitTranspiler(),
  };

  const { code: resolved } = resolve(segment, opts);

  try {
    return parse(resolved);
  } catch (e) {
    throw new Error(
      `Failed to parse the following: \n${resolved}\n\nCause:${String(e).substring(0, 128)}`,
    );
  }
}
