import { tgpu, d, std, type TgpuFn } from 'typegpu';

export const RADIX_BITS = 8;
export const RADIX_SIZE = 1 << RADIX_BITS;
export const TILE_THREADS = 256;
export const KEYS_PER_THREAD = 8;
export const TILE_SIZE = TILE_THREADS * KEYS_PER_THREAD;
export const NUM_PASSES = 32 / RADIX_BITS;

export type RadixKeyType = d.U32 | d.I32 | d.F32;
export type SortDirection = 'ascending' | 'descending';

export const paramsType = d.struct({ shift: d.u32, numTiles: d.u32 });

export const histLayout = tgpu.bindGroupLayout({
  hist: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

export const paramsLayout = tgpu.bindGroupLayout({
  params: { uniform: paramsType },
});

export const wgHist = tgpu.workgroupVar(d.arrayOf(d.atomic(d.u32), RADIX_SIZE));

function makeDigitFn(keyType: RadixKeyType, direction: SortDirection) {
  const ascendingImpls = {
    u32: tgpu.fn([d.u32, d.u32], d.u32)((v, shift) => (v >> shift) & (RADIX_SIZE - 1)),
    i32: tgpu.fn(
      [d.i32, d.u32],
      d.u32,
    )((v, shift) => {
      const raw = d.u32((v >> d.i32(shift)) & (RADIX_SIZE - 1));
      const signFix = std.select(d.u32(0), d.u32(RADIX_SIZE / 2), shift === 24);
      return raw ^ signFix;
    }),
    f32: tgpu.fn(
      [d.f32, d.u32],
      d.u32,
    )((v, shift) => {
      // -0 and +0 must map to the same bits, otherwise they sort apart
      const bits = std.select(std.bitcastF32toU32(v), d.u32(0), v === 0);
      const mask = std.select(d.u32(0x80000000), d.u32(0xffffffff), bits >> 31 === 1);
      return ((bits ^ mask) >> shift) & (RADIX_SIZE - 1);
    }),
  };

  const ascending = ascendingImpls[keyType.type];
  if (direction === 'ascending') {
    return ascending;
  }

  const paramType = keyType as d.U32;
  return tgpu.fn(
    [paramType, d.u32],
    d.u32,
  )((v, shift) => RADIX_SIZE - 1 - ascending(v as never, shift));
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

  const valuesLayout = valueType
    ? tgpu.bindGroupLayout({
        srcVals: { storage: d.arrayOf(valueType), access: 'readonly' },
        dstVals: { storage: d.arrayOf(valueType), access: 'mutable' },
      })
    : undefined;

  const copyValue = valueType as unknown as (value: unknown) => number;
  const writeOutput =
    valuesLayout && valueType
      ? tgpu.fn([keyType, d.u32, d.u32])((key, srcIdx, dstIdx) => {
          (ioLayout.$.dst[dstIdx] as number) = key;
          (valuesLayout.$.dstVals[dstIdx] as number) = copyValue(valuesLayout.$.srcVals[srcIdx]);
        })
      : tgpu.fn([keyType, d.u32, d.u32])((key, _srcIdx, dstIdx) => {
          (ioLayout.$.dst[dstIdx] as number) = key;
        });

  return {
    keyType,
    ioLayout,
    valuesLayout,
    writeOutput,
    digitFn: makeDigitFn(keyType, direction) as TgpuFn<(v: d.U32, shift: d.U32) => d.U32>,
  };
}

export type RadixSchemas = ReturnType<typeof makeRadixSchemas>;
