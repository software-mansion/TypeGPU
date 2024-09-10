import { transpileFn } from '@typegpu/tgsl-tools';
import type {
  AnyTgpuData,
  JitTranspiler as IJitTranspiler,
  Wgsl,
} from 'typegpu/experimental';

export class JitTranspiler implements IJitTranspiler {
  transpileFn(
    rawJs: string,
    argTypes: AnyTgpuData[],
    returnType: AnyTgpuData,
    externalMap: Record<string, Wgsl>,
  ): { head: Wgsl; body: Wgsl } {
    return transpileFn({ argTypes, returnType, externalMap }, rawJs);
  }
}
