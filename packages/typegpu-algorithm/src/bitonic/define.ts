import { d, type TgpuComputeFn, type TgpuRoot } from 'typegpu';
import {
  type BitonicKeyType,
  defaultCompare,
  makeBitonicLayouts,
  makePaddingKernels,
  makeSortKernels,
  stepLayout,
  stepUniformsType,
  validLayout,
} from './kernels.ts';
import type { BitonicSortDefinition, BitonicSortOptions, BitonicSortVariant } from './types.ts';

/**
 * Builds the pipelines of a bitonic sort with an arbitrary comparator. One definition serves
 * buffers of every size and every device, the instance picks the variant that fits.
 * @category Module
 */
export function define<TKey extends BitonicKeyType, TValue extends d.AnyWgslData = d.AnyWgslData>(
  root: TgpuRoot,
  options: BitonicSortOptions<TKey, TValue>,
): BitonicSortDefinition {
  const { keyType, valueType } = options;
  const compare = options.compare ?? defaultCompare;
  const layouts = makeBitonicLayouts(keyType, valueType);
  const createPipeline = (compute: TgpuComputeFn) => root.createComputePipeline({ compute });

  function makeVariant(padded: boolean): BitonicSortVariant {
    const kernels = makeSortKernels(layouts, compare, padded);
    return {
      localStorageSize: kernels.localStorageSize,
      globalStep: createPipeline(kernels.globalStep),
      localSort: createPipeline(kernels.localSort),
      localMerge: createPipeline(kernels.localMerge),
    };
  }

  const { pad, unpad } = makePaddingKernels(layouts);

  return {
    keyType,
    valueType,
    keyArray: d.arrayOf(keyType),
    valueArray: valueType ? d.arrayOf(valueType) : undefined,
    validArray: d.arrayOf(d.u32),
    stepUniformsType,
    dataLayout: layouts.dataLayout,
    valsLayout: layouts.valsLayout,
    copyLayout: layouts.copyLayout,
    valuesCopyLayout: layouts.valuesCopyLayout,
    validLayout,
    stepLayout,
    dense: makeVariant(false),
    padded: makeVariant(true),
    pad: createPipeline(pad),
    unpad: createPipeline(unpad),
  };
}
