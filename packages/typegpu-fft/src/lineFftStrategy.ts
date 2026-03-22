import type { StorageFlag, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamStagePipeline,
  dispatchStockhamLineFft,
  dispatchStockhamLineFftStages,
  type StockhamLineBindGroup,
  stockhamLayout,
  stockhamNsValues,
  stockhamStageCount,
  stockhamTwiddleLutVec2Count,
  stockhamUniformType,
} from './stockham.ts';
import { decomposeWorkgroups } from './utils.ts';

const STOCKHAM_WG = 256;

export type LineFftEncodeOptions = {
  /** Caller-owned encoder; each line-FFT stage records its own short compute pass, then you `finish` + `submit` once. */
  commandEncoder: GPUCommandEncoder;
  /**
   * Which line-FFT uniform pool: `0` forward row (`n`=width), `1` forward column, `2` inverse row, `3` inverse column.
   * Separates forward vs inverse so {@link createFft2d} can record full forward then full inverse on one encoder.
   * @default 0
   */
  lineUniformSlot?: 0 | 1 | 2 | 3;
  inverse?: boolean;
  /**
   * Debug: when `inverse` is set, run at most this many **kernel dispatches** **per**
   * `dispatchLineFft` call (each dispatch = one global read/write along the line).
   * **Stockham:** the first `N` radix-2 stages (increasing `ns`).
   * **Radix-4:** if `log₂(n)` is odd, the Stockham tail inverse runs first (one dispatch), then radix-4 inverse
   * stages in descending `p` order — each counts as one dispatch until `N` is exhausted.
   * Omit for a full inverse. `0` runs no inverse kernels for that dispatch (buffer unchanged).
   */
  inverseMaxStages?: number;
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
  /** Omit for pipelined forward without timestamp queries (same submits as profiling). */
  querySet?: GPUQuerySet;
  queryIndexStart: number;
  /** @see LineFftEncodeOptions.lineUniformSlot */
  lineUniformSlot?: 0 | 1 | 2 | 3;
  /**
   * Pack this many consecutive line-FFT stages into one queue submit (still one compute pass per stage).
   * Default `1` is one submit per stage; larger values merge submits toward the row/column split path.
   * Only the radix-2 Stockham `profileLineFft` in this package implements this (bisect driver submit merges).
   */
  lineStagesPerSubmit?: number;
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
    options: LineFftEncodeOptions,
  ): boolean;
  /**
   * One timestamp pair per line-FFT stage (separate submit per stage).
   * Required for {@link Fft2d.profileForward} unless extended to support coarse-only profiling.
   */
  profileLineFft?(args: LineFftProfileArgs): LineFftProfileResult;
  destroy(): void;
};

export type LineFftStrategyFactory = (ctx: LineFftStrategyFactoryContext) => LineFftStrategy;

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

  function profileLineFft(args: LineFftProfileArgs): LineFftProfileResult {
    const s = args.lineUniformSlot ?? 0;
    const slot = s >= 0 && s <= 3 ? s : 0;
    const pool = stockhamPools[slot as 0 | 1 | 2 | 3];
    const stockhamUniforms = pool.uniforms;
    const stockhamBindSrcA = pool.bindSrcA;
    const stockhamBindSrcB = pool.bindSrcB;

    const inverse = args.mode === 'inverse';
    const direction = inverse ? 1 : 0;
    const totalThreads = args.numLines * (args.n >> 1);
    const [wx, wy, wz] = decomposeWorkgroups(Math.ceil(totalThreads / STOCKHAM_WG));

    let idx = args.queryIndexStart;
    let inA = args.inputInA;

    const nsVals = stockhamNsValues(args.n);
    const groupSize = Math.max(1, Math.floor(args.lineStagesPerSubmit ?? 1));

    for (let si = 0; si < nsVals.length; si += groupSize) {
      const end = Math.min(si + groupSize, nsVals.length);
      const enc = args.device.createCommandEncoder({
        label: `fft2d line FFT ${args.mode} stages ${si}..${end - 1}`,
      });
      for (let j = si; j < end; j++) {
        const ns = nsVals.at(j);
        const uniforms = stockhamUniforms.at(j);
        const bgA = stockhamBindSrcA.at(j);
        const bgB = stockhamBindSrcB.at(j);
        if (ns === undefined || uniforms === undefined || bgA === undefined || bgB === undefined) {
          break;
        }
        uniforms.write({
          ns,
          n: args.n,
          lineStride: args.lineStride,
          numLines: args.numLines,
          direction,
        });
        const bg = inA ? bgA : bgB;
        const pass = enc.beginComputePass({
          label: 'fft2d line Stockham',
          ...(args.querySet !== undefined
            ? {
                timestampWrites: {
                  querySet: args.querySet,
                  beginningOfPassWriteIndex: idx,
                  endOfPassWriteIndex: idx + 1,
                },
              }
            : {}),
        });
        stockhamPipeline.with(pass).with(bg).dispatchWorkgroups(wx, wy, wz);
        pass.end();
        inA = !inA;
        idx += 2;
      }
      args.device.queue.submit([enc.finish()]);
    }

    return { queryIndexEnd: idx, resultInA: inA };
  }

  return {
    id: 'stockham-radix2',
    stageCount: stockhamStageCount,
    dispatchLineFft(n, lineStride, numLines, inputInA, options) {
      const s = options.lineUniformSlot ?? 0;
      const slot = s >= 0 && s <= 3 ? s : 0;
      const pool = stockhamPools[slot as 0 | 1 | 2 | 3];
      if (options.inverse === true && options.inverseMaxStages !== undefined) {
        return dispatchStockhamLineFftStages(
          stockhamPipeline,
          pool.uniforms,
          pool.bindSrcA,
          pool.bindSrcB,
          n,
          lineStride,
          numLines,
          inputInA,
          stockhamNsValues(n),
          options,
        );
      }
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
    profileLineFft,
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
