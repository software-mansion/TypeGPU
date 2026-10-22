import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  type RadixSchemas,
  shiftLayout,
  TILE_SIZE,
  TILE_THREADS,
  wgHist,
} from './schemas.ts';

export function makeCountKernel(schemas: RadixSchemas, elementCount: number, numTiles: number) {
  const { ioLayout, digitFn } = schemas;
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

      for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
        const globalIdx = tileBase + k * TILE_THREADS + localIdx;
        const loadIdx = needsBoundsCheck ? std.min(globalIdx, lastIndex) : globalIdx;
        const digit = digitFn(ioLayout.$.src[loadIdx] as number, shift);

        if (needsBoundsCheck ? globalIdx < elementCount : true) {
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
