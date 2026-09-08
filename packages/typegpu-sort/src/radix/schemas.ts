import { tgpu, d, std } from 'typegpu';

export const RADIX_BITS = 8;
export const RADIX_SIZE = 1 << RADIX_BITS;
export const TILE_THREADS = RADIX_SIZE;
export const KEYS_PER_THREAD = 8;
export const TILE_SIZE = TILE_THREADS * KEYS_PER_THREAD;

export type RadixKeyType = d.U32 | d.I32 | d.F32;
export type SortDirection = 'ascending' | 'descending';

export const histLayout = tgpu.bindGroupLayout({
  hist: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

export const shiftLayout = tgpu.bindGroupLayout({
  shift: { uniform: d.u32 },
});

export const wgHist = tgpu.workgroupVar(d.arrayOf(d.atomic(d.u32), RADIX_SIZE));

export function makeDigitFn(key: (v: number) => number) {
  return function digit(v: number, shift: number): number {
    'use gpu';
    return (key(v) >>> shift) & (RADIX_SIZE - 1);
  };
}

export function makeRadixSchemas(
  keyType: RadixKeyType,
  key: (v: number) => number,
  valueType?: d.AnyWgslData,
) {
  const ioLayout = tgpu.bindGroupLayout({
    src: { storage: d.arrayOf(keyType), access: 'readonly' },
    dst: { storage: d.arrayOf(keyType), access: 'mutable' },
  });

  const hasPayload = valueType !== undefined;
  const payloadType = valueType ?? d.u32;

  const valuesLayout = tgpu.bindGroupLayout({
    srcVals: { storage: d.arrayOf(payloadType), access: 'readonly' },
    dstVals: { storage: d.arrayOf(payloadType), access: 'mutable' },
  });

  function writeOutput(key: number, srcIdx: number, dstIdx: number) {
    'use gpu';
    ioLayout.$.dst[dstIdx] = key;
    if (hasPayload) {
      valuesLayout.$.dstVals[dstIdx] = std.copy(valuesLayout.$.srcVals[srcIdx]);
    }
  }

  return {
    keyType,
    ioLayout,
    valuesLayout,
    writeOutput,
    digitFn: makeDigitFn(key),
  };
}

export type RadixSchemas = ReturnType<typeof makeRadixSchemas>;
