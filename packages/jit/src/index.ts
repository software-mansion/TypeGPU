import { transpileFn } from '@typegpu/tgsl-tools';
import type { JitTranspiler as IJitTranspiler } from 'typegpu/experimental';
import type * as smol from 'typegpu/smol';

export class JitTranspiler implements IJitTranspiler {
  transpileFn(rawJs: string): {
    argNames: string[];
    body: smol.Block;
    externalNames: string[];
  } {
    return transpileFn(rawJs);
  }
}
