import type { d } from 'typegpu';
import type { ScanElementType } from './schemas.ts';

export interface BinaryOp<TElement extends ScanElementType = d.F32> {
  operation: (a: number, b: number) => number;
  identityElement: number;
  /** Element type of the buffers to scan. Defaults to `d.f32` */
  dataType?: TElement;
}
