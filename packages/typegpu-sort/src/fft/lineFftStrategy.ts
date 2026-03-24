import type { StorageFlag, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamStagePipeline,
  dispatchStockhamLineFft,
  type StockhamLineBindGroup,
  stockhamLayout,
  stockhamStageCount,
  stockhamTwiddleLutVec2Count,
  stockhamUniformType,
} from './stockham.ts';

export type LineFftEncodeOptions = {
  /** Caller-owned compute pass; must stay open for the whole `dispatchLineFft` call. */
  computePass: GPUComputePassEncoder;
  /**
   * Which line-FFT uniform pool: `0` forward row (`n`=width), `1` forward column, `2` inverse row, `3` inverse column.
   * Separates forward vs inverse so {@link createFft2d} can record full forward then full inverse on one pass.
   * @default 0
   */
  lineUniformSlot?: 0 | 1 | 2 | 3;
  inverse?: boolean;
};

/** Context passed to {@link LineFftStrategyFactory} when {@link createFft2d} builds the 2D FFT. */
export type LineFftStrategyFactoryContext = {
  root: TgpuRoot;
  /** `max(width, height)` — line FFT length is at most this. */
  nMax: number;
  bufA: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  bufB: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
};

/**
 * Pluggable 1D line FFT along contiguous lines in a complex `vec2` buffer.
 * Row and column passes in {@link createFft2d} both use this; transpose stays separate.
 *
 * **Contract:** `dispatchLineFft(..., { inverse: false })` and `{ inverse: true }` must implement the **same**
 * unnormalized complex DFT / IDFT pair as the reference Stockham radix-2 path ({@link createStockhamRadix2LineStrategy}).
 * A faster **forward** factorization (e.g. radix-4 stages) still defines one linear operator `F`; the inverse pass
 * must apply `F⁻¹`, not merely “reverse stages and conjugate twiddles” unless that has been shown equivalent.
 * It is valid for `inverse: true` to use a different **sequence** of kernels (e.g. full Stockham inverse) as long
 * as it is mathematically the inverse of the same `F`. Custom strategies should verify **round-trip** (forward →
 * inverse vs input, up to `1/(n·numLines)` scaling) — matching forward output to Stockham is necessary but **not**
 * sufficient for inverse correctness.
 */
export type LineFftStrategy = {
  readonly id: string;
  /**
   * Number of global read/write stages for line length `n` (power of two), forward direction.
   */
  stageCount(n: number): number;
  /**
   * Out-of-place along each line: `n` points, stride between consecutive line elements,
   * `numLines` parallel lines. Returns whether the result sits in `bufA` (`true`) or `bufB` (`false`).
   * With `options.inverse`, applies the inverse line DFT consistent with the forward transform above.
   */
  dispatchLineFft(
    n: number,
    lineStride: number,
    numLines: number,
    inputInA: boolean,
    options: LineFftEncodeOptions,
  ): boolean;
  destroy(): void;
};

export type LineFftStrategyFactory = (ctx: LineFftStrategyFactoryContext) => LineFftStrategy;

/**
 * Pure radix-2 Stockham line FFT (reference implementation). {@link createFft2d} defaults to the faster
 * {@link createStockhamRadix4LineStrategy} instead; pass this factory to opt into radix-2 only.
 */
export function createStockhamRadix2LineStrategy(
  ctx: LineFftStrategyFactoryContext,
): LineFftStrategy {
  const { root, nMax, bufA, bufB } = ctx;
  const twiddleLutLen = stockhamTwiddleLutVec2Count(nMax);
  const twiddleLut = root.createBuffer(d.arrayOf(d.vec2f, twiddleLutLen)).$usage('storage');
  twiddleLut.write(buildStockhamTwiddleLut(nMax).map(([x, y]) => d.vec2f(x, y)));

  const maxStockhamStages = stockhamStageCount(nMax);
  const stockhamPipeline = createStockhamStagePipeline(root);

  function createStockhamPool(): {
    uniforms: (TgpuBuffer<typeof stockhamUniformType> & UniformFlag)[];
    bindSrcA: StockhamLineBindGroup[];
    bindSrcB: StockhamLineBindGroup[];
  } {
    const uniforms = Array.from({ length: maxStockhamStages }, () =>
      root.createBuffer(stockhamUniformType).$usage('uniform'),
    );
    const bindSrcA: StockhamLineBindGroup[] = uniforms.map((uniforms) =>
      root.createBindGroup(stockhamLayout, {
        uniforms,
        twiddles: twiddleLut,
        src: bufA,
        dst: bufB,
      }),
    );
    const bindSrcB: StockhamLineBindGroup[] = uniforms.map((uniforms) =>
      root.createBindGroup(stockhamLayout, {
        uniforms,
        twiddles: twiddleLut,
        src: bufB,
        dst: bufA,
      }),
    );
    return { uniforms, bindSrcA, bindSrcB };
  }

  const stockhamPool0 = createStockhamPool();
  const stockhamPool1 = createStockhamPool();
  const stockhamPool2 = createStockhamPool();
  const stockhamPool3 = createStockhamPool();
  const stockhamPools = [stockhamPool0, stockhamPool1, stockhamPool2, stockhamPool3] as const;

  return {
    id: 'stockham-radix2',
    stageCount: stockhamStageCount,
    dispatchLineFft(n, lineStride, numLines, inputInA, options) {
      const s = options.lineUniformSlot ?? 0;
      const slot = s >= 0 && s <= 3 ? s : 0;
      const pool = stockhamPools[slot as 0 | 1 | 2 | 3];
      return dispatchStockhamLineFft(
        stockhamPipeline,
        pool.uniforms,
        pool.bindSrcA,
        pool.bindSrcB,
        n,
        lineStride,
        numLines,
        inputInA,
        options,
      );
    },
    destroy() {
      twiddleLut.destroy();
      for (const p of stockhamPools) {
        for (const u of p.uniforms) {
          u.destroy();
        }
      }
    },
  };
}
