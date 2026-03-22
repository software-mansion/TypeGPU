import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamStagePipeline,
  dispatchStockhamLineFft,
  stockhamLayout,
  stockhamNsValues,
  stockhamStageCount,
  stockhamTwiddleLutVec2Count,
  stockhamUniformType,
} from './stockham.ts';
import { decomposeWorkgroups } from './utils.ts';

const STOCKHAM_WG = 256;

export type LineFftEncodeOptions = {
  computePass?: GPUComputePassEncoder;
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

export type LineFftProfileArgs = {
  mode: 'forward' | 'inverse';
  n: number;
  lineStride: number;
  numLines: number;
  inputInA: boolean;
  device: GPUDevice;
  querySet: GPUQuerySet;
  queryIndexStart: number;
};

export type LineFftProfileResult = {
  queryIndexEnd: number;
  resultInA: boolean;
};

/**
 * Pluggable 1D line FFT along contiguous lines in a complex `vec2` buffer.
 * Row and column passes in {@link createFft2d} both use this; transpose stays separate.
 *
 * **Contract:** `dispatchLineFft(..., { inverse: false })` and `{ inverse: true }` must implement the **same**
 * unnormalized complex DFT / IDFT pair as the default Stockham radix-2 path (same convention as {@link createFft2d}).
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
   * Number of global read/write stages for line length `n` (power of two), used for **forward** profiling
   * sizing ({@link fftForwardProfileQueryIndexCount}, {@link profileLineFft} in forward mode). If inverse uses
   * more stages than forward, document it; {@link Fft2d.profileForward} currently profiles forward only.
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
    options?: LineFftEncodeOptions,
  ): boolean;
  /**
   * One timestamp pair per line-FFT stage (separate submit per stage).
   * Required for {@link Fft2d.profileForward} unless extended to support coarse-only profiling.
   */
  profileLineFft?(args: LineFftProfileArgs): LineFftProfileResult;
  destroy(): void;
};

export type LineFftStrategyFactory = (ctx: LineFftStrategyFactoryContext) => LineFftStrategy;

function lineFftEncodeOpts(
  computePass?: GPUComputePassEncoder,
  inverse?: boolean,
): LineFftEncodeOptions | undefined {
  if (computePass !== undefined) {
    return inverse ? { computePass, inverse: true } : { computePass };
  }
  return inverse ? { inverse: true as const } : undefined;
}

/**
 * Default: radix-2 Stockham stages (current @typegpu/fft behavior). Use as
 * `lineFftStrategyFactory: createStockhamRadix2LineStrategy` or rely on {@link createFft2d} default.
 */
export function createStockhamRadix2LineStrategy(
  ctx: LineFftStrategyFactoryContext,
): LineFftStrategy {
  const { root, nMax, bufA, bufB } = ctx;
  const twiddleLutLen = stockhamTwiddleLutVec2Count(nMax);
  const twiddleLut = root.createBuffer(d.arrayOf(d.vec2f, twiddleLutLen)).$usage('storage');
  twiddleLut.write(buildStockhamTwiddleLut(nMax).map(([x, y]) => d.vec2f(x, y)));

  const stockhamUniform = root.createBuffer(stockhamUniformType).$usage('uniform');
  const stockhamPipeline = createStockhamStagePipeline(root);

  const stockhamBgSrcA = root.createBindGroup(stockhamLayout, {
    uniforms: stockhamUniform,
    twiddles: twiddleLut,
    src: bufA,
    dst: bufB,
  });
  const stockhamBgSrcB = root.createBindGroup(stockhamLayout, {
    uniforms: stockhamUniform,
    twiddles: twiddleLut,
    src: bufB,
    dst: bufA,
  });

  function profileLineFft(args: LineFftProfileArgs): LineFftProfileResult {
    const inverse = args.mode === 'inverse';
    const direction = inverse ? 1 : 0;
    const totalThreads = args.numLines * (args.n >> 1);
    const [wx, wy, wz] = decomposeWorkgroups(Math.ceil(totalThreads / STOCKHAM_WG));

    let idx = args.queryIndexStart;
    let inA = args.inputInA;

    for (const ns of stockhamNsValues(args.n)) {
      stockhamUniform.write({
        ns,
        n: args.n,
        lineStride: args.lineStride,
        numLines: args.numLines,
        direction,
      });
      const bg = inA ? stockhamBgSrcA : stockhamBgSrcB;
      const enc = args.device.createCommandEncoder({ label: `fft2d line FFT ${args.mode} stage` });
      const pass = enc.beginComputePass({
        label: 'fft2d line Stockham',
        timestampWrites: {
          querySet: args.querySet,
          beginningOfPassWriteIndex: idx,
          endOfPassWriteIndex: idx + 1,
        },
      });
      stockhamPipeline.with(pass).with(bg).dispatchWorkgroups(wx, wy, wz);
      pass.end();
      args.device.queue.submit([enc.finish()]);
      inA = !inA;
      idx += 2;
    }

    return { queryIndexEnd: idx, resultInA: inA };
  }

  return {
    id: 'stockham-radix2',
    stageCount: stockhamStageCount,
    dispatchLineFft(n, lineStride, numLines, inputInA, options) {
      return dispatchStockhamLineFft(
        stockhamPipeline,
        stockhamUniform,
        n,
        lineStride,
        numLines,
        inputInA,
        stockhamBgSrcA,
        stockhamBgSrcB,
        lineFftEncodeOpts(options?.computePass, options?.inverse),
      );
    },
    profileLineFft,
    destroy() {
      twiddleLut.destroy();
      stockhamUniform.destroy();
    },
  };
}

/**
 * Same radix-2 Stockham line FFT as {@link createStockhamRadix2LineStrategy}, distinct {@link LineFftStrategy.id}
 * for parity / factory tests.
 */
export function createStockhamRadix2LineStrategyCopy(
  ctx: LineFftStrategyFactoryContext,
): LineFftStrategy {
  const inner = createStockhamRadix2LineStrategy(ctx);
  const profileLineFft = inner.profileLineFft;
  if (!profileLineFft) {
    throw new Error('@typegpu/fft: createStockhamRadix2LineStrategyCopy: inner strategy missing profileLineFft');
  }
  return {
    id: 'stockham-radix2-copy',
    stageCount: inner.stageCount.bind(inner),
    dispatchLineFft: inner.dispatchLineFft.bind(inner),
    profileLineFft: profileLineFft.bind(inner),
    destroy() {
      inner.destroy();
    },
  };
}
