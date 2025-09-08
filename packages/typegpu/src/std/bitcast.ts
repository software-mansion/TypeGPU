import { createDualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { snip } from '../data/snippet.ts';

export const bitcastU32toF32 = createDualImpl(
  // CPU implementation
  (n: number) => {
    const buffer = new ArrayBuffer(4);
    const uint32View = new Uint32Array(buffer);
    const float32View = new Float32Array(buffer);
    uint32View[0] = n;
    return float32View[0];
  },
  // GPU implementation
  (n) => snip(stitch`bitcast<f32>(${n})`, n.dataType),
  'bitcastU32toF32',
);

export const bitcastU32toI32 = createDualImpl(
  // CPU implementation
  (n: number) => {
    const buffer = new ArrayBuffer(4);
    const uint32View = new Uint32Array(buffer);
    const int32View = new Int32Array(buffer);
    uint32View[0] = n;
    return int32View[0];
  },
  // GPU implementation
  (n) => snip(stitch`bitcast<i32>(${n})`, n.dataType),
  'bitcastU32toI32',
);

export function checkEndian() {
  const arrayBuffer = new ArrayBuffer(2);
  const uint8Array = new Uint8Array(arrayBuffer);
  const uint16array = new Uint16Array(arrayBuffer);
  uint8Array[0] = 0xAA;
  uint8Array[1] = 0xBB;
  if (uint16array[0] === 0xBBAA) return 'little endian';
  if (uint16array[0] === 0xAABB) return 'big endian';
  throw new Error('Something crazy just happened');
}
