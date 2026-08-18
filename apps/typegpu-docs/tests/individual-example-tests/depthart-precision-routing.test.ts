import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDepthBundle } from '../../src/examples/image-processing/monocular-light-injection/inference/bundle.ts';
import {
  halfConvertedConvWeights,
  outerProductPointwiseWeights,
  winogradConvDispatches,
} from '../../src/examples/image-processing/monocular-light-injection/inference/dispatches.ts';
import type { DepthBundle } from '../../src/examples/image-processing/monocular-light-injection/inference/types.ts';

const BUNDLE = new URL(
  '../../public/assets/depthart/depthart-relative-l-448-balanced.depthart',
  import.meta.url,
);

/** Weights are hosted externally, so this suite only runs where a local copy exists */
const hasBundle = existsSync(BUNDLE);

let cached: DepthBundle | undefined;

function bundle(): DepthBundle {
  cached ??= parseDepthBundle(Uint8Array.from(readFileSync(BUNDLE)).buffer);
  return cached;
}

/**
 * The FP16 precision pass changes what a dispatch computes, so the set of
 * dispatches it reaches is pinned against the shipped bundle rather than left to
 * whatever the routing conditions happen to select.
 */
describe.skipIf(!hasBundle)('FP16 precision routing over the shipped bundle', () => {
  it('transposes one weight tensor for each 1x1 that takes the outer-product kernel', () => {
    const transposes = outerProductPointwiseWeights(bundle());
    expect(transposes).toHaveLength(62);
    expect(new Set(transposes.map(({ tensorId }) => tensorId)).size).toBe(62);
    for (const transpose of transposes) {
      expect(transpose.elementBytes).toBe(2);
      expect(transpose.byteLength % 32).toBe(0);
      expect(transpose.byteOffset % 16).toBe(0);
    }
  });

  it('leaves every transposed range disjoint from the others', () => {
    const ranges = outerProductPointwiseWeights(bundle())
      .map(({ byteOffset, byteLength }) => [byteOffset, byteOffset + byteLength] as const)
      .toSorted((left, right) => left[0] - right[0]);
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]?.[0]).toBeGreaterThanOrEqual(ranges[index - 1]?.[1] ?? 0);
    }
  });

  it('converts exactly the seven convolutions the export profile pinned to FP32', () => {
    expect(halfConvertedConvWeights(bundle())).toEqual([
      'dispatch-0037',
      'dispatch-0079',
      'dispatch-0172',
      'dispatch-0224',
      'dispatch-0231',
      'dispatch-0238',
      'dispatch-0245',
    ]);
  });

  it('leaves the Winograd convolutions on their own FP32 filter transform', () => {
    const converted = new Set(halfConvertedConvWeights(bundle()));
    for (const id of ['dispatch-0040', 'dispatch-0082', 'dispatch-0175', 'dispatch-0218']) {
      expect(converted.has(id)).toBe(false);
    }
  });

  it('keeps the large model on its established Winograd dispatch set', () => {
    expect(winogradConvDispatches(bundle())).toEqual([
      'dispatch-0040',
      'dispatch-0044',
      'dispatch-0046',
      'dispatch-0082',
      'dispatch-0086',
      'dispatch-0088',
      'dispatch-0175',
      'dispatch-0179',
      'dispatch-0181',
      'dispatch-0218',
      'dispatch-0220',
      'dispatch-0221',
      'dispatch-0227',
      'dispatch-0228',
      'dispatch-0234',
      'dispatch-0235',
      'dispatch-0241',
      'dispatch-0242',
    ]);
  });
});

/**
 * An `f32-reference` bundle exists to be a ground truth. Converting its weights
 * would quietly make it something else, and it is the bundle an A/B comparison
 * is measured against, so the guard is pinned rather than assumed.
 */
describe('the FP32 reference profile is left alone', () => {
  const reference = () =>
    parseDepthBundle(
      Uint8Array.from(
        readFileSync(
          new URL(
            '../../../../tools/depthart/tests/fixtures/depthart-all-ops-v1.bin',
            import.meta.url,
          ),
        ),
      ).buffer,
    );

  it('converts no weights even though every convolution weight is FP32', () => {
    const parsed = reference();
    expect(parsed.precision).toBe('f32-reference');
    expect(parsed.dispatches.filter(({ op }) => op === 'conv2d').length).toBeGreaterThan(0);
    expect(halfConvertedConvWeights(parsed)).toEqual([]);
    expect(outerProductPointwiseWeights(parsed)).toEqual([]);
    expect(winogradConvDispatches(parsed)).toEqual([]);
  });
});
