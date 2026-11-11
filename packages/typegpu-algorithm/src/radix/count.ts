import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  type RadixSchemas,
  shiftLayout,
  tileCount,
  TILE_SIZE,
  TILE_THREADS,
  wgHist,
} from './schemas.ts';

export function makeCountKernel(schemas: RadixSchemas) {
  const { ioLayout, digitFn } = schemas;

  return tgpu.computeFn({ workgroupSize: [TILE_THREADS], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const localIdx = lid.x;
      const tileId = flatWorkgroupIndex(wid, numWorkgroups);
      const numTiles = tileCount();
      if (tileId >= numTiles) {
        return;
      }
      const elementCount = ioLayout.$.src.length;

      const tileBase = tileId * TILE_SIZE;
      const shift = shiftLayout.$.shift;

      for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
        const globalIdx = tileBase + k * TILE_THREADS + localIdx;
        const digit = digitFn(
          ioLayout.$.src[std.min(globalIdx, elementCount - 1)] as number,
          shift,
        );

        if (globalIdx < elementCount) {
          std.atomicAdd(wgHist.$[digit] as d.atomicU32, 1);
        }
      }
      std.workgroupBarrier();

      histLayout.$.hist[localIdx * numTiles + tileId] = std.atomicLoad(
        wgHist.$[localIdx] as d.atomicU32,
      );
    },
  );
}
