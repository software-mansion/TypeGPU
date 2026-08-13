import { tgpu, d, std, type TgpuComputeFn } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  RADIX_SIZE,
  type RadixSchemas,
  shiftLayout,
  TILE_SIZE,
  TILE_THREADS,
} from './schemas.ts';

const BITSET_WORD_BITS = 32;
const BITSET_WORD_SHIFT = Math.log2(BITSET_WORD_BITS);
const BITSET_WORDS = TILE_THREADS / BITSET_WORD_BITS;

const runningTotal = tgpu.workgroupVar(d.arrayOf(d.u32, RADIX_SIZE));
const digitBits = tgpu.workgroupVar(d.arrayOf(d.atomic(d.u32), BITSET_WORDS * RADIX_SIZE));

export function makeScatterKernel(
  schemas: RadixSchemas,
  elementCount: number,
  numTiles: number,
): TgpuComputeFn {
  const { ioLayout, digitFn, writeOutput } = schemas;
  const needsBoundsCheck = elementCount % TILE_SIZE !== 0;
  const lastIndex = elementCount - 1;

  return tgpu.computeFn({ workgroupSize: [TILE_THREADS], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const localIdx = lid.x;
      const tileId = flatWorkgroupIndex(wid, numWorkgroups);
      if (tileId >= numTiles) {
        return;
      }

      const tileBase = tileId * TILE_SIZE;
      const shift = shiftLayout.$.shift;
      const bitsetWord = localIdx >>> BITSET_WORD_SHIFT;
      const bitsetMask = d.u32(1) << (localIdx & (BITSET_WORD_BITS - 1));
      const earlierBits = bitsetMask - 1;

      runningTotal.$[localIdx] = histLayout.$.hist[localIdx * numTiles + tileId] as number;

      for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
        const globalIdx = tileBase + k * TILE_THREADS + localIdx;
        const loadIdx = needsBoundsCheck ? std.min(globalIdx, lastIndex) : globalIdx;
        const key = ioLayout.$.src[loadIdx] as number;
        const digit = digitFn(key, shift);
        const inBounds = needsBoundsCheck ? globalIdx < elementCount : true;

        if (inBounds) {
          std.atomicOr(digitBits.$[bitsetWord * RADIX_SIZE + digit] as d.atomicU32, bitsetMask);
        }
        std.workgroupBarrier();

        let rank = d.u32(0);
        let digitTotal = d.u32(0);
        if (inBounds) {
          for (const word of tgpu.unroll(std.range(BITSET_WORDS))) {
            const bits = std.atomicLoad(digitBits.$[word * RADIX_SIZE + digit] as d.atomicU32);
            const mask = std.select(
              std.select(d.u32(0), earlierBits, word === bitsetWord),
              d.u32(0xffffffff),
              word < bitsetWord,
            );
            rank = rank + std.countOneBits(bits & mask);
            digitTotal = digitTotal + std.countOneBits(bits);
          }

          writeOutput(key, globalIdx, (runningTotal.$[digit] as number) + rank);
        }
        std.workgroupBarrier();

        if (inBounds) {
          std.atomicStore(digitBits.$[bitsetWord * RADIX_SIZE + digit] as d.atomicU32, 0);
          if (rank === 0) {
            runningTotal.$[digit] = (runningTotal.$[digit] as number) + digitTotal;
          }
        }
        std.workgroupBarrier();
      }
    },
  );
}
