import { tgpu, d, std } from 'typegpu';
import { flatWorkgroupIndex } from '../wgslUtils.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  paramsLayout,
  type RadixSchemas,
  TILE_SIZE,
  TILE_THREADS,
  wgHist,
} from './schemas.ts';

export function makeCountKernel(schemas: RadixSchemas) {
  const { ioLayout, digitFn } = schemas;

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

    std.atomicStore(wgHist.$[local_i] as d.atomicU32, 0);
    std.workgroupBarrier();

    for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
      const global_i = tile_base + k * TILE_THREADS + local_i;
      if (global_i < ioLayout.$.src.length) {
        const digit = digitFn(ioLayout.$.src[global_i] as number, paramsLayout.$.params.shift);
        std.atomicAdd(wgHist.$[digit] as d.atomicU32, 1);
      }
    }
    std.workgroupBarrier();

    const count = std.atomicLoad(wgHist.$[local_i] as d.atomicU32);
    if (tile_id < paramsLayout.$.params.numTiles) {
      histLayout.$.hist[local_i * paramsLayout.$.params.numTiles + tile_id] = count;
    }
  });
}
