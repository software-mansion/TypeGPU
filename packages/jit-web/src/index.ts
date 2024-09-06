import { transpileFn } from '@typegpu/js2tgsl';
import type { AnyTgpuData, JitTranspiler, Wgsl } from 'typegpu/experimental';

export class JitWebTranspiler implements JitTranspiler {
  transpileFn(
    rawJs: string,
    argTypes: AnyTgpuData[],
    returnType: AnyTgpuData,
    externalMap: Record<string, Wgsl>,
  ): { head: Wgsl; body: Wgsl } {
    return transpileFn({ argTypes, returnType, externalMap }, rawJs);
  }
}
