import { tgpu, d } from 'typegpu';

export const WORKGROUP_SIZE = 256;
export const ELEMENTS_PER_THREAD = 8;
export const BLOCK_SIZE = WORKGROUP_SIZE * ELEMENTS_PER_THREAD;
const TILE_SLOTS = BLOCK_SIZE + BLOCK_SIZE / 32;

export type ScanElementType = d.F32 | d.U32 | d.I32;

export function makeScanSchemas(elementType: ScanElementType) {
  return {
    elementType,
    scanLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'mutable' },
      sums: { storage: d.arrayOf(elementType), access: 'mutable' },
      // The bound buffer can be larger than the array, so `arrayLength` is not the element count.
      count: { uniform: d.u32 },
    }),
    applySumsLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'mutable' },
      sums: { storage: d.arrayOf(elementType), access: 'readonly' },
      count: { uniform: d.u32 },
    }),
    workgroupMemory: tgpu.workgroupVar(d.arrayOf(elementType, WORKGROUP_SIZE)),
    tile: tgpu.workgroupVar(d.arrayOf(elementType, TILE_SLOTS)),
  };
}

export type ScanSchemas = ReturnType<typeof makeScanSchemas>;
