import { tgpu, d, std, type TgpuComputeFn } from 'typegpu';
import { flatWorkgroupIndex } from '../wgslUtils.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  paramsLayout,
  RADIX_BITS,
  RADIX_SIZE,
  type RadixSchemas,
  TILE_SIZE,
  TILE_THREADS,
} from './schemas.ts';

const runningTotal = tgpu.workgroupVar(d.arrayOf(d.u32, RADIX_SIZE));

/**
 * Subgroup-accelerated stable scatter. Each workgroup owns a TILE_SIZE-element
 * tile and processes it in KEYS_PER_THREAD sequential rounds of TILE_THREADS
 * elements, carrying a per-digit running offset in workgroup memory so ranks
 * stay stable across rounds.
 *
 * Within a round, the rank of an invocation among same-digit lanes comes from a
 * bitwise multi-split: one ballot per digit bit (plus one validity ballot),
 * AND-combined into a mask of lanes that share every bit of this lane's digit.
 * All ballots execute in uniform control flow. Ranks of whole subgroups are then
 * combined through workgroup memory, assuming `subgroup_id` reflects invocation
 * order within the workgroup — a property that holds on production GPUs, though
 * WGSL does not strictly guarantee it. The fallback scatter is free of that
 * assumption.
 *
 * `maxSubgroups` must be an upper bound for the number of subgroups per workgroup
 * (TILE_THREADS / minimum subgroup size of the device).
 */
export function makeSubgroupScatterKernel(
  schemas: RadixSchemas,
  maxSubgroups: number,
): TgpuComputeFn {
  const { ioLayout, digitFn, writeOutput } = schemas;
  const sgHist = tgpu.workgroupVar(d.arrayOf(d.u32, maxSubgroups * RADIX_SIZE));

  return tgpu.computeFn({
    workgroupSize: [TILE_THREADS],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
      lane: d.builtin.subgroupInvocationId,
      sgId: d.builtin.subgroupId,
    },
  })(({ lid, wid, numWorkgroups, lane, sgId }) => {
    const local_i = lid.x;
    const tile_id = flatWorkgroupIndex(wid, numWorkgroups);
    const tile_base = tile_id * TILE_SIZE;

    const word_idx = lane >> 5;
    const bit_idx = lane & 31;
    const partial_mask = (d.u32(1) << bit_idx) - 1;

    runningTotal.$[local_i] = 0;

    for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
      for (const s of tgpu.unroll(std.range(maxSubgroups))) {
        sgHist.$[s * RADIX_SIZE + local_i] = 0;
      }
      std.workgroupBarrier();

      const global_i = tile_base + k * TILE_THREADS + local_i;
      const inBounds = global_i < ioLayout.$.src.length;
      let my_digit = d.u32(0);
      if (inBounds) {
        my_digit = digitFn(ioLayout.$.src[global_i] as number, paramsLayout.$.params.shift);
      }

      let m0 = d.u32(0xffffffff);
      let m1 = d.u32(0xffffffff);
      let m2 = d.u32(0xffffffff);
      let m3 = d.u32(0xffffffff);
      for (const bit of tgpu.unroll(std.range(RADIX_BITS))) {
        const isSet = ((my_digit >> bit) & 1) === 1;
        const ballot = std.subgroupBallot(isSet);
        const flip = std.select(d.u32(0xffffffff), d.u32(0), isSet);
        m0 = m0 & (ballot.x ^ flip);
        m1 = m1 & (ballot.y ^ flip);
        m2 = m2 & (ballot.z ^ flip);
        m3 = m3 & (ballot.w ^ flip);
      }
      const valid = std.subgroupBallot(inBounds);
      m0 = m0 & valid.x;
      m1 = m1 & valid.y;
      m2 = m2 & valid.z;
      m3 = m3 & valid.w;

      let prefix = d.u32(0);
      if (word_idx >= 1) {
        prefix = prefix + std.countOneBits(m0);
      }
      if (word_idx >= 2) {
        prefix = prefix + std.countOneBits(m1);
      }
      if (word_idx >= 3) {
        prefix = prefix + std.countOneBits(m2);
      }
      let the_word = m0;
      if (word_idx === 1) {
        the_word = m1;
      }
      if (word_idx === 2) {
        the_word = m2;
      }
      if (word_idx === 3) {
        the_word = m3;
      }
      const rank_in_sg = prefix + std.countOneBits(the_word & partial_mask);
      const sg_count =
        std.countOneBits(m0) + std.countOneBits(m1) + std.countOneBits(m2) + std.countOneBits(m3);

      if (inBounds && rank_in_sg === 0) {
        sgHist.$[sgId * RADIX_SIZE + my_digit] = sg_count;
      }
      std.workgroupBarrier();

      let round_total = d.u32(0);
      for (const s of tgpu.unroll(std.range(maxSubgroups))) {
        round_total = round_total + (sgHist.$[s * RADIX_SIZE + local_i] as number);
      }

      if (inBounds) {
        let sg_prefix = d.u32(0);
        for (let sg = d.u32(0); sg < sgId; sg++) {
          sg_prefix = sg_prefix + (sgHist.$[sg * RADIX_SIZE + my_digit] as number);
        }
        const local_rank = sg_prefix + rank_in_sg;
        const output_pos =
          (histLayout.$.hist[my_digit * paramsLayout.$.params.numTiles + tile_id] as number) +
          (runningTotal.$[my_digit] as number) +
          local_rank;
        writeOutput(global_i, output_pos);
      }
      std.workgroupBarrier();

      runningTotal.$[local_i] = (runningTotal.$[local_i] as number) + round_total;
    }
  });
}
