import { tgpu, d } from 'typegpu';

export const WORKGROUP_SIZE = 256;
export const ELEMENTS_PER_THREAD = 8;
export const BLOCK_SIZE = WORKGROUP_SIZE * ELEMENTS_PER_THREAD;

export type ScanElementType = d.F32 | d.U32 | d.I32;

export function makeScanSchemas(elementType: ScanElementType) {
  return {
    elementType,
    scanLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'mutable' },
      sums: { storage: d.arrayOf(elementType), access: 'mutable' },
    }),
    applySumsLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'mutable' },
      sums: { storage: d.arrayOf(elementType), access: 'readonly' },
    }),
    operatorSlot: tgpu.slot<(a: number, b: number) => number>(),
    identitySlot: tgpu.accessor(elementType),
    reduceOnlySlot: tgpu.slot<boolean>(),
    workgroupMemory: tgpu.workgroupVar(d.arrayOf(elementType, WORKGROUP_SIZE)),
  };
}

export type ScanSchemas = ReturnType<typeof makeScanSchemas>;
