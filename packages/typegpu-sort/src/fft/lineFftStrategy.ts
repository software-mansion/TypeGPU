import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { d } from 'typegpu';

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
  /**
   * Orthonormal 2D separable convention: multiply the **last** butterfly stage's outputs by this factor
   * (typically `1/sqrt(n)` for line length `n`). Applied inside that stage's kernel — no extra compute pass.
   */
  lastPassOrthonormalScale?: number;
  /**
   * Orthonormal inverse: multiply the **first** inverse stage's outputs by this factor (typically
   * `1/sqrt(n)` — same as forward — since GPU kernels are unnormalized: `F_inv(F(x)) = N*x`).
   */
  firstPassOrthonormalScale?: number;
};

/** Context passed to {@link LineFftStrategyFactory} when {@link createFft2d} builds the 2D FFT. */
export type LineFftStrategyFactoryContext = {
  root: TgpuRoot;
  /** `max(width, height)` — line FFT length is at most this. */
  nMax: number;
  /**
   * Row-major grid size for this strategy. Uniform pools for slots `0`–`3` are pre-written for this
   * layout (same convention as {@link createFft2d}: rows along `width`, columns along `height`).
   */
  width: number;
  height: number;
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
 * must apply `F^-1`, not merely "reverse stages and conjugate twiddles" unless that has been shown equivalent.
 * It is valid for `inverse: true` to use a different **sequence** of kernels (e.g. full Stockham inverse) as long
 * as it is mathematically the inverse of the same `F`. Custom strategies should verify **round-trip** (forward then
 * inverse vs input, up to float noise) — matching forward output to Stockham is necessary but **not**
 * sufficient for inverse correctness.
 */
export type LineFftStrategy = {
  readonly id: string;
  /**
   * Number of global read/write stages for line length `n` (power of two), forward direction.
   */
  stageCount(n: number): number;
  /**
   * Out-of-place along each line: `n` points per line, `numLines` parallel lines. Returns whether the
   * result sits in `bufA` (`true`) or `bufB` (`false`). With `options.inverse`, applies the inverse line
   * DFT consistent with the forward transform above.
   *
   * `lineStride` and other layout fields live in uniforms written at strategy creation for a fixed
   * `(width, height)`; dispatch only needs `n` and `numLines` for workgroup sizing.
   */
  dispatchLineFft(
    n: number,
    numLines: number,
    inputInA: boolean,
    options: LineFftEncodeOptions,
  ): boolean;
  destroy(): void;
};

export type LineFftStrategyFactory = (ctx: LineFftStrategyFactoryContext) => LineFftStrategy;
