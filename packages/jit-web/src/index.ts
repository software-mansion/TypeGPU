import type { AnyTgpuData, JitTranspiler, Wgsl } from 'typegpu/experimental';

export class JitWebTranspiler implements JitTranspiler {
  transpileFn(
    rawJs: string,
    argTypes: AnyTgpuData[],
    returnType: AnyTgpuData,
    externalMap: Record<string, Wgsl>,
  ): { head: Wgsl; body: Wgsl } {
    throw new Error('Method not implemented.');
  }
}
