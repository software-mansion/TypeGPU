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

const tileDigits = tgpu.workgroupVar(d.arrayOf(d.u32, TILE_THREADS));
const runningTotal = tgpu.workgroupVar(d.arrayOf(d.u32, RADIX_SIZE));

/**
 * Stable scatter without subgroup operations. Each workgroup owns a
 * TILE_SIZE-element tile and processes it in KEYS_PER_THREAD sequential rounds
 * of TILE_THREADS elements, carrying a per-digit running offset in workgroup
 * memory so ranks stay stable across rounds.
 *
 * Within a round, each thread derives its rank by counting matching digits among
 * the preceding threads, and doubles as the accountant for one digit value
 * (digit == its local index), tallying that digit's total for the round in the
 * same loop — O(TILE_THREADS) work per thread, chosen for correctness on devices
 * without the 'subgroups' feature rather than for speed.
 */
export function makeFallbackScatterKernel(schemas: RadixSchemas): TgpuComputeFn {
  const { ioLayout, digitFn, writeOutput } = schemas;

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

    runningTotal.$[local_i] = 0;

    for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
      const global_i = tile_base + k * TILE_THREADS + local_i;
      const inBounds = global_i < ioLayout.$.src.length;
      let my_digit = d.u32(RADIX_SIZE);
      if (inBounds) {
        my_digit = digitFn(ioLayout.$.src[global_i] as number, paramsLayout.$.params.shift);
      }

      tileDigits.$[local_i] = my_digit;
      std.workgroupBarrier();

      let rank = d.u32(0);
      let round_total = d.u32(0);
      for (let j = d.u32(0); j < TILE_THREADS; j++) {
        const digit_j = tileDigits.$[j] as number;
        if (j < local_i && digit_j === my_digit) {
          rank = rank + 1;
        }
        if (digit_j === local_i) {
          round_total = round_total + 1;
        }
      }

      if (inBounds) {
        const output_pos =
          (histLayout.$.hist[my_digit * paramsLayout.$.params.numTiles + tile_id] as number) +
          (runningTotal.$[my_digit] as number) +
          rank;
        writeOutput(global_i, output_pos);
      }
      std.workgroupBarrier();

      runningTotal.$[local_i] = (runningTotal.$[local_i] as number) + round_total;
    }
  });
}
