import { tgpu, d, std } from 'typegpu';

export const RADIX_BITS = 8;
export const RADIX_SIZE = 1 << RADIX_BITS;
export const NUM_PASSES = 32 / RADIX_BITS;
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

function digitOfU32(v: number, shift: number): number {
  'use gpu';
  return (v >> shift) & (RADIX_SIZE - 1);
}

function digitOfI32(v: number, shift: number): number {
  'use gpu';
  const raw = d.u32((v >> shift) & (RADIX_SIZE - 1));
  return raw ^ std.select(d.u32(0), d.u32(RADIX_SIZE / 2), shift === 24);
}

function digitOfF32(v: number, shift: number): number {
  'use gpu';
  // -0 and +0 must map to the same bits, otherwise they sort apart
  const bits = std.select(std.bitcastF32toU32(v), d.u32(0), v === 0);
  const mask = std.select(d.u32(0x80000000), d.u32(0xffffffff), bits >> 31 === 1);
  return ((bits ^ mask) >> shift) & (RADIX_SIZE - 1);
}

const ascendingDigits = {
  u32: digitOfU32,
  i32: digitOfI32,
  f32: digitOfF32,
} as const;

export function makeDigitFn(keyType: RadixKeyType, direction: SortDirection) {
  const ascending = ascendingDigits[keyType.type];
  if (direction === 'ascending') {
    return ascending;
  }

  function descendingDigit(v: number, shift: number) {
    'use gpu';
    return RADIX_SIZE - 1 - ascending(v, shift);
  }

  return descendingDigit;
}

export function makeRadixSchemas(
  keyType: RadixKeyType,
  direction: SortDirection,
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
    (ioLayout.$.dst[dstIdx] as number) = key;
    if (hasPayload) {
      (valuesLayout.$.dstVals[dstIdx] as number) = std.copy(
        valuesLayout.$.srcVals[srcIdx] as number,
      );
    }
  }

  return {
    keyType,
    ioLayout,
    valuesLayout,
    writeOutput,
    digitFn: makeDigitFn(keyType, direction),
  };
}

export type RadixSchemas = ReturnType<typeof makeRadixSchemas>;
