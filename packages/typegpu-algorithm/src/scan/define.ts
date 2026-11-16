import { d, type TgpuRoot } from 'typegpu';
import { makeApplySumsKernel, makeScanKernel } from './kernels.ts';
import { makeScanSchemas, type ScanElementType } from './schemas.ts';
import type { PrefixScanDefinition, PrefixScanOptions } from './types.ts';

/**
 * Builds the pipelines of an exclusive prefix scan (or, with `reduceOnly`, a reduction) with
 * the given associative operation. One definition serves buffers of every size.
 * @category Module
 */
export function define<TElement extends ScanElementType>(
  root: TgpuRoot,
  options: PrefixScanOptions<TElement>,
): PrefixScanDefinition<TElement> {
  const { elementType, operation, identityElement } = options;
  const reduceOnly = options.reduceOnly ?? false;
  const schemas = makeScanSchemas(elementType);

  return {
    elementType,
    reduceOnly,
    sumsArray: d.arrayOf(elementType),
    scanLayout: schemas.scanLayout,
    applySumsLayout: schemas.applySumsLayout,
    scan: root.createComputePipeline({
      compute: makeScanKernel(schemas, operation, identityElement, reduceOnly),
    }),
    applySums: reduceOnly
      ? undefined
      : root.createComputePipeline({ compute: makeApplySumsKernel(schemas, operation) }),
  };
}
