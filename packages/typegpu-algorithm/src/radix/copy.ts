import { tgpu, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import {
  KEYS_PER_THREAD,
  type RadixSchemas,
  tileCount,
  TILE_SIZE,
  TILE_THREADS,
} from './schemas.ts';

/** Copies keys (and values) from `src` to `dst`, after an odd number of in-place passes */
export function makeCopyKernel(schemas: RadixSchemas) {
  const { ioLayout, writeOutput } = schemas;

  return tgpu.computeFn({ workgroupSize: [TILE_THREADS], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const tileId = flatWorkgroupIndex(wid, numWorkgroups);
      if (tileId >= tileCount()) {
        return;
      }

      const size = ioLayout.$.src.length;
      const tileBase = tileId * TILE_SIZE;
      for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
        const idx = tileBase + k * TILE_THREADS + lid.x;
        if (idx < size) {
          writeOutput(ioLayout.$.src[idx] as number, idx, idx);
        }
      }
    },
  );
}
