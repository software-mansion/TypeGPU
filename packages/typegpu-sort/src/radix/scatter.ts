import { tgpu, d, std, type TgpuComputeFn } from 'typegpu';
import { flatWorkgroupIndex } from '../wgslUtils.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  paramsLayout,
  RADIX_SIZE,
  type RadixSchemas,
  TILE_SIZE,
  TILE_THREADS,
} from './schemas.ts';

const runningTotal = tgpu.workgroupVar(d.arrayOf(d.u32, RADIX_SIZE));
const BITSET_WORD_BITS = 32;
const BITSET_WORDS = TILE_THREADS / BITSET_WORD_BITS;
const digitBits = tgpu.workgroupVar(d.arrayOf(d.atomic(d.u32), BITSET_WORDS * RADIX_SIZE));

export function makeScatterKernel(schemas: RadixSchemas, elementCount: number): TgpuComputeFn {
  const { ioLayout, digitFn, writeOutput } = schemas;
  const needsBoundsCheck = elementCount % TILE_SIZE !== 0;
  const lastIndex = elementCount - 1;

  return tgpu.computeFn({
    workgroupSize: [TILE_THREADS],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const local_i = lid.x;
    const tile_id = flatWorkgroupIndex(wid, numWorkgroups);
    const tile_base = tile_id * TILE_SIZE;
    const bitset_word = local_i >> 5;
    const bitset_mask = d.u32(1) << (local_i & (BITSET_WORD_BITS - 1));
    const earlierBits = bitset_mask - 1;
    const shift = paramsLayout.$.params.shift;

    runningTotal.$[local_i] = histLayout.$.hist[
      local_i * paramsLayout.$.params.numTiles + tile_id
    ] as number;

    for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
      const global_i = tile_base + k * TILE_THREADS + local_i;
      let load_i = global_i;
      if (needsBoundsCheck) {
        load_i = std.min(global_i, lastIndex);
      }
      const key = ioLayout.$.src[load_i] as number;
      const my_digit = digitFn(key, shift);
      const inBounds = needsBoundsCheck ? global_i < elementCount : true;

      if (inBounds) {
        std.atomicOr(digitBits.$[bitset_word * RADIX_SIZE + my_digit] as d.atomicU32, bitset_mask);
      }
      std.workgroupBarrier();

      let rank = d.u32(0);
      let digit_total = d.u32(0);
      if (inBounds) {
        for (const word of tgpu.unroll(std.range(BITSET_WORDS))) {
          const bits = std.atomicLoad(digitBits.$[word * RADIX_SIZE + my_digit] as d.atomicU32);
          const mask = std.select(
            std.select(d.u32(0), earlierBits, word === bitset_word),
            d.u32(0xffffffff),
            word < bitset_word,
          );
          rank = rank + std.countOneBits(bits & mask);
          digit_total = digit_total + std.countOneBits(bits);
        }
        const output_pos = (runningTotal.$[my_digit] as number) + rank;
        writeOutput(key, global_i, output_pos);
      }
      std.workgroupBarrier();

      if (inBounds) {
        std.atomicStore(digitBits.$[bitset_word * RADIX_SIZE + my_digit] as d.atomicU32, 0);
        if (rank === 0) {
          runningTotal.$[my_digit] = (runningTotal.$[my_digit] as number) + digit_total;
        }
      }
      std.workgroupBarrier();
    }
  });
}
