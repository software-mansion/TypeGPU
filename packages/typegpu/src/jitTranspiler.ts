import type { AnyTgpuData, Wgsl } from './types';

/**
 * Used to transpile JS resources into WGSL on demand.
 */
export interface JitTranspiler {
  transpileFn(
    rawJs: string,
    argTypes: AnyTgpuData[],
    returnType: AnyTgpuData | undefined,
    externalMap: Record<string, Wgsl>,
  ): { head: Wgsl; body: Wgsl };
}
