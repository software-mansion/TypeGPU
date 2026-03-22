import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { d } from 'typegpu';
import {
  createStockhamRadix2LineStrategy,
  type LineFftStrategy,
  type LineFftStrategyFactory,
} from './lineFftStrategy.ts';
import { stockhamStageCount } from './stockham.ts';
import {
  createTransposePipeline,
  dispatchTranspose,
  transposeLayout,
  transposeUniformType,
} from './transpose.ts';

function lineFftOpts(computePass?: GPUComputePassEncoder, inverse?: boolean) {
  if (computePass !== undefined) {
    return inverse ? { computePass, inverse: true } : { computePass };
  }
  return inverse ? { inverse: true as const } : undefined;
}

export type Fft2dOptions = {
  width: number;
  height: number;
  /**
   * When `true` (default), column-direction FFT uses global transpose + row Stockham on the transposed
   * layout. When `false`, a strided in-place column pass will be used instead (not implemented yet).
   */
  useGlobalTranspose?: boolean;
  /**
   * When `true`, omits the final `H×W` transpose after the column pass. The spectrum stays in the
   * intermediate **transposed** layout (same linear buffer, frequency axes swapped vs row-major natural).
   * Callers must interpret filters / indexing accordingly, or call {@link Fft2d.retileSpectrumToNatural}
   * for natural spectrum layout (e.g. custom inverse paths). {@link Fft2d.inverse} does not retile when
   * this is set; it uses a factored inverse on the skip layout.
   */
  skipFinalTranspose?: boolean;
  /**
   * Pluggable 1D line FFT (Stockham along contiguous lines). Default: radix-2 Stockham via
   * {@link createStockhamRadix2LineStrategy}.
   */
  lineFftStrategyFactory?: LineFftStrategyFactory;
};

/**
 * Timestamp query slots needed for {@link Fft2d.profileForward} (two indices per line-FFT stage
 * and per transpose). Does not include caller-owned slots (e.g. fill/filter).
 */
export function fftForwardProfileQueryIndexCount(
  width: number,
  height: number,
  opts?: { skipFinalTranspose?: boolean; lineStageCount?: (n: number) => number },
): number {
  const stage = opts?.lineStageCount ?? stockhamStageCount;
  const transposes = opts?.skipFinalTranspose ? 1 : 2;
  return 2 * stage(width) + transposes * 2 + 2 * stage(height);
}

export type Fft2d = {
  readonly width: number;
  readonly height: number;
  /** Mirrors {@link Fft2dOptions.useGlobalTranspose}. */
  readonly useGlobalTranspose: boolean;
  /** Mirrors {@link Fft2dOptions.skipFinalTranspose}. */
  readonly skipFinalTranspose: boolean;
  /** Id of the active {@link LineFftStrategy} (e.g. `stockham-radix2`). */
  readonly lineFftStrategyId: string;
  /**
   * Applies the `H×W` transpose that {@link forward} skips when `skipFinalTranspose` is set — restores
   * natural row-major spectrum layout. No-op when `skipFinalTranspose` is false. Use before custom
   * `inverse` logic if you bypass {@link inverse}.
   */
  retileSpectrumToNatural(): void;
  encodeRetileSpectrumToNatural(computePass: GPUComputePassEncoder): void;
  /**
   * Write complex samples `vec2(re, im)` here before `forward()` (row-major: `y * width + x`).
   * Same buffer as `pingPong[0]`.
   */
  readonly input: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  /**
   * Fixed ping-pong pair for the transform. After each `forward()` / `inverse()`, the latest
   * coefficients live in `pingPong[outputSlot()]` (use this to build two bind groups and pick per frame).
   */
  readonly pingPong: readonly [
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
  ];
  /** `0` or `1` — index into `pingPong` for the buffer that holds the last transform result. */
  outputSlot(): 0 | 1;
  /** Buffer that holds the result of the last `forward()` or `inverse()` (same indexing). */
  output(): TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  /**
   * 1D FFT along every row (`width` points per row, `height` rows), row-major layout.
   * Composes with {@link transformColumns1DForward} to match {@link forward} (for `useGlobalTranspose: true`).
   */
  transformRows1DForward(): void;
  /** Inverse of {@link transformRows1DForward} on the current buffer (inverse line FFT, no global conjugate). */
  transformRows1DInverse(): void;
  /**
   * 1D FFT along every column in row-major storage. With `useGlobalTranspose: true`, uses
   * transpose → row-direction FFT on `height×width` → transpose back.
   */
  transformColumns1DForward(): void;
  /** Inverse of {@link transformColumns1DForward} (inverse line FFT + same transposes as forward). */
  transformColumns1DInverse(): void;
  encodeTransformRows1DForward(computePass: GPUComputePassEncoder): void;
  encodeTransformRows1DInverse(computePass: GPUComputePassEncoder): void;
  encodeTransformColumns1DForward(computePass: GPUComputePassEncoder): void;
  encodeTransformColumns1DInverse(computePass: GPUComputePassEncoder): void;
  /**
   * Full 2D forward from {@link input} (`pingPong[0]`). Equivalent to {@link transformRows1DForward}
   * then a column pass; if {@link skipFinalTranspose} is set, the column pass omits the final
   * `H×W` transpose (spectrum axes swapped vs natural row-major — see {@link retileSpectrumToNatural}).
   */
  forward(): void;
  /** Record forward FFT on a caller-owned compute pass (experimental; `forward()` is safer). */
  encodeForward(computePass: GPUComputePassEncoder): void;
  /**
   * Same result as `forward()`, with one queue submit per line-FFT stage and per transpose so
   * uniform updates stay correct. Each submit uses a compute pass with `timestampWrites` for two
   * query indices (begin/end). First pair starts at `timestampBaseIndex` (e.g. after fill/filter slots).
   * Requires the line strategy to implement per-stage profiling (default Stockham does).
   */
  profileForward(device: GPUDevice, querySet: GPUQuerySet, timestampBaseIndex: number): void;
  /**
   * Inverse DFT of the spectrum from the last `forward()` (same ping-pong buffers).
   * Uses inverse line FFT stages (e.g. conjugated twiddles for Stockham) — no buffer-wide
   * `conj` passes. Caller still scales reals by `1/(WH)` for unnormalized Stockham.
   */
  inverse(): void;
  /** Record inverse FFT on a caller-owned compute pass (experimental; `inverse()` is safer). */
  encodeInverse(computePass: GPUComputePassEncoder): void;
  destroy(): void;
};

/**
 * Radix-2 Stockham 2D FFT on row-major `width×height` complex buffers (`input` = `pingPong[0]`).
 * {@link Fft2d.forward} applies row FFT then a column pass (starting from buffer A). With
 * `skipFinalTranspose: true`, the column pass omits the final `H×W` transpose; {@link Fft2d.inverse} uses
 * inverse line FFT on that layout (no global conjugate passes).
 * `useGlobalTranspose: false` is reserved for a strided column pass and currently throws on column / 2D forward.
 *
 * `width` and `height` must be powers of two. NPOT sizes would need mixed radix / Bluestein elsewhere.
 */
export function createFft2d(root: TgpuRoot, options: Fft2dOptions): Fft2d {
  const { width: W, height: H } = options;
  const useGlobalTranspose = options.useGlobalTranspose !== false;
  const skipFinalTranspose = options.skipFinalTranspose === true;
  const lineFftFactory = options.lineFftStrategyFactory ?? createStockhamRadix2LineStrategy;

  if (W <= 0 || H <= 0) {
    throw new Error('FFT dimensions must be positive');
  }
  if ((W & (W - 1)) !== 0 || (H & (H - 1)) !== 0) {
    throw new Error(`FFT width and height must be powers of two (got ${W}×${H})`);
  }

  const count = W * H;
  const bufA = root.createBuffer(d.arrayOf(d.vec2f, count)).$usage('storage');
  const bufB = root.createBuffer(d.arrayOf(d.vec2f, count)).$usage('storage');

  const nMax = Math.max(W, H);
  const lineFft: LineFftStrategy = lineFftFactory({
    root,
    nMax,
    bufA,
    bufB,
  });

  const transposeUniform = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposePipeline = createTransposePipeline(root);

  const transposeBgSrcA = root.createBindGroup(transposeLayout, {
    uniforms: transposeUniform,
    src: bufA,
    dst: bufB,
  });
  const transposeBgSrcB = root.createBindGroup(transposeLayout, {
    uniforms: transposeUniform,
    src: bufB,
    dst: bufA,
  });

  let resultInA = true;

  /**
   * Inverse 2D on skip-final spectrum layout: inverse column line FFT on `W×H`, then `T(H×W)`,
   * then inverse row line FFT on `H×W`.
   */
  function inverseFromSkipSpectrumDirect(computePass?: GPUComputePassEncoder) {
    let inA = resultInA;

    inA = lineFft.dispatchLineFft(H, H, W, inA, lineFftOpts(computePass, true));

    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      inA ? transposeBgSrcA : transposeBgSrcB,
      H,
      W,
      computePass,
    );
    inA = !inA;

    inA = lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(computePass, true));

    resultInA = inA;
  }

  function assertGlobalTranspose(method: string) {
    if (!useGlobalTranspose) {
      throw new Error(
        `@typegpu/fft: ${method} requires \`useGlobalTranspose: true\` until strided column FFT is implemented (set useGlobalTranspose: false is reserved).`,
      );
    }
  }

  /** Row-direction line FFT forward; `inA` = source buffer for first read. */
  function applyRows1DForward(inA: boolean, computePass?: GPUComputePassEncoder): boolean {
    return lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(computePass));
  }

  /** Row-direction inverse line FFT on `H×W` row-major (`width` points per row). */
  function applyRows1DInversePass(inA: boolean, computePass?: GPUComputePassEncoder): boolean {
    return lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(computePass, true));
  }

  /** Column-direction forward in row-major layout via global transposes + line FFT on `H×W`. */
  function applyColumns1DForward(inA: boolean, computePass?: GPUComputePassEncoder): boolean {
    assertGlobalTranspose('applyColumns1DForward');
    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      inA ? transposeBgSrcA : transposeBgSrcB,
      W,
      H,
      computePass,
    );
    const afterTInA = !inA;

    const midInA = lineFft.dispatchLineFft(H, H, W, afterTInA, lineFftOpts(computePass));

    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      midInA ? transposeBgSrcA : transposeBgSrcB,
      H,
      W,
      computePass,
    );
    return !midInA;
  }

  /** Same transposes as {@link applyColumns1DForward}, inverse line FFT in the middle. */
  function applyColumns1DInversePass(inA: boolean, computePass?: GPUComputePassEncoder): boolean {
    assertGlobalTranspose('applyColumns1DInversePass');
    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      inA ? transposeBgSrcA : transposeBgSrcB,
      W,
      H,
      computePass,
    );
    const afterTInA = !inA;

    const midInA = lineFft.dispatchLineFft(H, H, W, afterTInA, lineFftOpts(computePass, true));

    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      midInA ? transposeBgSrcA : transposeBgSrcB,
      H,
      W,
      computePass,
    );
    return !midInA;
  }

  /** Column pass through transposed layout but **without** the closing `H×W` transpose. */
  function applyColumns1DForwardLeavingTransposed(
    inA: boolean,
    computePass?: GPUComputePassEncoder,
  ): boolean {
    assertGlobalTranspose('applyColumns1DForwardLeavingTransposed');
    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      inA ? transposeBgSrcA : transposeBgSrcB,
      W,
      H,
      computePass,
    );
    const afterTInA = !inA;
    return lineFft.dispatchLineFft(H, H, W, afterTInA, lineFftOpts(computePass));
  }

  /** Full 2D forward with both transposes. */
  function forwardFromFull(initialInA: boolean, computePass?: GPUComputePassEncoder) {
    let inA = initialInA;
    inA = applyRows1DForward(inA, computePass);
    inA = applyColumns1DForward(inA, computePass);
    resultInA = inA;
  }

  /** Full 2D inverse: inverse row FFT then inverse column pass (inverse line FFT + transposes). */
  function forwardFromFullInverse(initialInA: boolean, computePass?: GPUComputePassEncoder) {
    let inA = initialInA;
    inA = applyRows1DInversePass(inA, computePass);
    inA = applyColumns1DInversePass(inA, computePass);
    resultInA = inA;
  }

  function forwardFrom(initialInA: boolean, computePass?: GPUComputePassEncoder) {
    let inA = initialInA;
    inA = applyRows1DForward(inA, computePass);
    inA = skipFinalTranspose
      ? applyColumns1DForwardLeavingTransposed(inA, computePass)
      : applyColumns1DForward(inA, computePass);
    resultInA = inA;
  }

  function retileSpectrumToNaturalInternal(computePass?: GPUComputePassEncoder) {
    if (!skipFinalTranspose) {
      return;
    }
    const inA = resultInA;
    dispatchTranspose(
      transposePipeline,
      transposeUniform,
      inA ? transposeBgSrcA : transposeBgSrcB,
      H,
      W,
      computePass,
    );
    resultInA = !inA;
  }

  function forwardFromProfiled(
    initialInA: boolean,
    gpuDevice: GPUDevice,
    querySet: GPUQuerySet,
    baseIndex: number,
  ) {
    assertGlobalTranspose('profileForward');
    const profile = lineFft.profileLineFft;
    if (!profile) {
      throw new Error(
        '@typegpu/fft: profileForward requires the line FFT strategy to implement profileLineFft(...)',
      );
    }

    let idx = baseIndex;
    let inA = initialInA;

    const rowPr = profile({
      mode: 'forward',
      n: W,
      lineStride: W,
      numLines: H,
      inputInA: inA,
      device: gpuDevice,
      querySet,
      queryIndexStart: idx,
    });
    idx = rowPr.queryIndexEnd;
    inA = rowPr.resultInA;

    {
      const enc = gpuDevice.createCommandEncoder({ label: 'fft2d transpose W×H' });
      const pass = enc.beginComputePass({
        label: 'fft2d transpose W×H',
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: idx,
          endOfPassWriteIndex: idx + 1,
        },
      });
      dispatchTranspose(
        transposePipeline,
        transposeUniform,
        inA ? transposeBgSrcA : transposeBgSrcB,
        W,
        H,
        pass,
      );
      pass.end();
      gpuDevice.queue.submit([enc.finish()]);
      idx += 2;
    }
    const afterTInA = !inA;

    const colPr = profile({
      mode: 'forward',
      n: H,
      lineStride: H,
      numLines: W,
      inputInA: afterTInA,
      device: gpuDevice,
      querySet,
      queryIndexStart: idx,
    });
    idx = colPr.queryIndexEnd;
    const colInA = colPr.resultInA;

    if (!skipFinalTranspose) {
      const enc = gpuDevice.createCommandEncoder({ label: 'fft2d transpose H×W' });
      const pass = enc.beginComputePass({
        label: 'fft2d transpose H×W',
        timestampWrites: {
          querySet,
          beginningOfPassWriteIndex: idx,
          endOfPassWriteIndex: idx + 1,
        },
      });
      dispatchTranspose(
        transposePipeline,
        transposeUniform,
        colInA ? transposeBgSrcA : transposeBgSrcB,
        H,
        W,
        pass,
      );
      pass.end();
      gpuDevice.queue.submit([enc.finish()]);
      resultInA = !colInA;
    } else {
      resultInA = colInA;
    }
  }

  return {
    width: W,
    height: H,
    useGlobalTranspose,
    skipFinalTranspose,
    lineFftStrategyId: lineFft.id,
    input: bufA,
    pingPong: [bufA, bufB] as const,
    outputSlot(): 0 | 1 {
      return resultInA ? 0 : 1;
    },
    output() {
      return resultInA ? bufA : bufB;
    },
    transformRows1DForward() {
      resultInA = applyRows1DForward(resultInA);
    },
    transformRows1DInverse() {
      resultInA = applyRows1DInversePass(resultInA);
    },
    transformColumns1DForward() {
      resultInA = applyColumns1DForward(resultInA);
    },
    transformColumns1DInverse() {
      resultInA = applyColumns1DInversePass(resultInA);
    },
    encodeTransformRows1DForward(computePass) {
      resultInA = applyRows1DForward(resultInA, computePass);
    },
    encodeTransformRows1DInverse(computePass) {
      resultInA = applyRows1DInversePass(resultInA, computePass);
    },
    encodeTransformColumns1DForward(computePass) {
      resultInA = applyColumns1DForward(resultInA, computePass);
    },
    encodeTransformColumns1DInverse(computePass) {
      resultInA = applyColumns1DInversePass(resultInA, computePass);
    },
    forward() {
      forwardFrom(true);
    },
    encodeForward(computePass) {
      forwardFrom(true, computePass);
    },
    profileForward(gpuDevice, querySet, timestampBaseIndex) {
      forwardFromProfiled(true, gpuDevice, querySet, timestampBaseIndex);
    },
    retileSpectrumToNatural() {
      retileSpectrumToNaturalInternal();
    },
    encodeRetileSpectrumToNatural(computePass) {
      retileSpectrumToNaturalInternal(computePass);
    },
    inverse() {
      if (skipFinalTranspose) {
        inverseFromSkipSpectrumDirect();
      } else {
        retileSpectrumToNaturalInternal();
        forwardFromFullInverse(resultInA);
      }
    },
    encodeInverse(computePass) {
      if (skipFinalTranspose) {
        inverseFromSkipSpectrumDirect(computePass);
      } else {
        retileSpectrumToNaturalInternal(computePass);
        forwardFromFullInverse(resultInA, computePass);
      }
    },
    destroy() {
      lineFft.destroy();
      bufA.destroy();
      bufB.destroy();
      transposeUniform.destroy();
    },
  };
}
