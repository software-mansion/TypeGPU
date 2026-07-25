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

/**
 * Counts digit occurrences per tile into a digit-major histogram. `elementCount`
 * is baked into the kernel, so keys are bounds-checked only when the buffer does
 * not divide evenly into tiles.
 */
export function makeCountKernel(schemas: RadixSchemas, elementCount: number) {
  const { ioLayout, digitFn } = schemas;
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
    const shift = paramsLayout.$.params.shift;

    std.atomicStore(wgHist.$[local_i] as d.atomicU32, 0);
    std.workgroupBarrier();

    for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
      const global_i = tile_base + k * TILE_THREADS + local_i;
      let load_i = global_i;
      if (needsBoundsCheck) {
        load_i = std.min(global_i, lastIndex);
      }
      const digit = digitFn(ioLayout.$.src[load_i] as number, shift);
      const inBounds = needsBoundsCheck ? global_i < elementCount : true;
      if (inBounds) {
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
