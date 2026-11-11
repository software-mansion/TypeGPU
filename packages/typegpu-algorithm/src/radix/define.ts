import { d, std, type TgpuRoot } from 'typegpu';
import { define as defineScan } from '../scan/define.ts';
import { makeCopyKernel } from './copy.ts';
import { makeCountKernel } from './count.ts';
import { normalizeKey } from './key.ts';
import { makeScatterKernel } from './scatter.ts';
import {
  histLayout,
  makeRadixSchemas,
  RADIX_BITS,
  type RadixKeyType,
  shiftLayout,
} from './schemas.ts';
import type { RadixSortDefinition, RadixSortOptions } from './types.ts';

/**
 * Builds the pipelines of a stable LSD radix sort. One definition serves buffers of every size.
 * For `f32` keys, -0 and +0 compare equal.
 * @category Module
 */
export function define<TKey extends RadixKeyType, TValue extends d.AnyWgslData = d.AnyWgslData>(
  root: TgpuRoot,
  options: RadixSortOptions<TKey, TValue>,
): RadixSortDefinition {
  const { keyType, valueType } = options;
  const { keyBits, sortKey } = normalizeKey(keyType, options);
  const schemas = makeRadixSchemas(keyType, sortKey, valueType);

  return {
    keyType,
    valueType,
    numPasses: Math.ceil(keyBits / RADIX_BITS),
    keyArray: d.arrayOf(keyType),
    valueArray: valueType ? d.arrayOf(valueType) : undefined,
    histArray: d.arrayOf(d.u32),
    shiftType: d.u32,
    ioLayout: schemas.ioLayout,
    valuesLayout: schemas.valuesLayout,
    histLayout,
    shiftLayout,
    count: root.createComputePipeline({ compute: makeCountKernel(schemas) }),
    scatter: root.createComputePipeline({ compute: makeScatterKernel(schemas) }),
    copy: root.createComputePipeline({ compute: makeCopyKernel(schemas) }),
    scan: defineScan(root, { elementType: d.u32, operation: std.add, identityElement: 0 }),
  };
}
