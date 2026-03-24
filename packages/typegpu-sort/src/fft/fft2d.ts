import type { StorageFlag, TgpuBindGroup, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import { d } from 'typegpu';
import type { LineFftStrategyFactory } from './lineFftStrategy.ts';
import { createStockhamRadix4LineStrategy } from './lineFftRadix4Strategy.ts';
import {
  createTransposePipeline,
  dispatchTranspose,
  transposeLayout,
  transposeUniformType,
} from './transpose.ts';

type TransposeBgPair = {
  bgSrcA: TgpuBindGroup<(typeof transposeLayout)['entries']>;
  bgSrcB: TgpuBindGroup<(typeof transposeLayout)['entries']>;
};

function pickTransposeBg(
  pair: TransposeBgPair,
  inA: boolean,
): TgpuBindGroup<(typeof transposeLayout)['entries']> {
  return inA ? pair.bgSrcA : pair.bgSrcB;
}

export type Fft2dOptions = {
  width: number;
  height: number;
  /**
   * When `true`, omits the final `H×W` transpose after the column pass. The spectrum stays in the
   * intermediate **transposed** layout (same linear buffer, frequency axes swapped vs row-major natural).
   * Callers must interpret filters / indexing accordingly. {@link Fft2d.encodeInverse} uses a
   * factored inverse on the skip layout when this is set.
   */
  skipFinalTranspose?: boolean;
  /**
   * Pluggable 1D line FFT (Stockham-style along contiguous lines). Default: faster radix-4 + optional
   * radix-2 tail via {@link createStockhamRadix4LineStrategy}. Pass {@link createStockhamRadix2LineStrategy}
   * for pure radix-2 Stockham.
   */
  lineFftStrategyFactory?: LineFftStrategyFactory;
};

export type Fft2d = {
  readonly width: number;
  readonly height: number;
  readonly skipFinalTranspose: boolean;
  /**
   * Write complex samples `vec2(re, im)` before {@link Fft2d.encodeForward} (row-major: `y * width + x`).
   * Same buffer as `buffers[0]`.
   */
  readonly input: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  readonly buffers: readonly [
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
  ];
  outputIndex(): 0 | 1;
  /** Buffer that holds the result of the last encode pass (same indexing). */
  output(): TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  /**
   * Full 2D forward from {@link input} (`buffers[0]`). Records dispatches on `computePass`; caller must
   * `end` the pass and `submit` the encoder.
   */
  encodeForward(computePass: GPUComputePassEncoder): void;
  /**
   * Inverse DFT of the spectrum from the last forward (same buffers). Records on `computePass`.
   */
  encodeInverse(computePass: GPUComputePassEncoder): void;
  destroy(): void;
};

/**
 * 2D FFT on row-major `width×height` complex buffers (`input` = `buffers[0]`). Default line FFT is
 * radix-4 Stockham (Bainville) with an optional radix-2 tail; override with {@link Fft2dOptions.lineFftStrategyFactory}.
 * All GPU work is recorded on a caller-owned {@link GPUComputePassEncoder}.
 *
 * Per-stage uniform buffers are distinct so many dispatches can be recorded in one pass before `submit`
 * without last-write-wins. Line strategies use four duplicate uniform pools (slots `0`–`3`) for row/column
 * forward and inverse passes.
 */
export function createFft2d(root: TgpuRoot, options: Fft2dOptions): Fft2d {
  const { width: W, height: H } = options;
  const skipFinalTranspose = options.skipFinalTranspose === true;
  const lineFftFactory = options.lineFftStrategyFactory ?? createStockhamRadix4LineStrategy;

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
  const lineFft = lineFftFactory({ root, nMax, width: W, height: H, bufA, bufB });

  const transposeUniformFwd0 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformFwd1 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformInv0 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformInv1 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformInvAux = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposePipeline = createTransposePipeline(root);

  function mkTransposePair(
    uniformBuf: TgpuBuffer<typeof transposeUniformType> & UniformFlag,
  ): TransposeBgPair {
    return {
      bgSrcA: root.createBindGroup(transposeLayout, {
        uniforms: uniformBuf,
        src: bufA,
        dst: bufB,
      }),
      bgSrcB: root.createBindGroup(transposeLayout, {
        uniforms: uniformBuf,
        src: bufB,
        dst: bufA,
      }),
    };
  }
  const transposePairFwd0 = mkTransposePair(transposeUniformFwd0);
  const transposePairFwd1 = mkTransposePair(transposeUniformFwd1);
  const transposePairInv0 = mkTransposePair(transposeUniformInv0);
  const transposePairInv1 = mkTransposePair(transposeUniformInv1);
  const transposePairInvAux = mkTransposePair(transposeUniformInvAux);

  // Transpose uniforms (constant for fixed W×H)
  transposeUniformFwd0.write({ srcCols: W, srcRows: H });
  transposeUniformFwd1.write({ srcCols: H, srcRows: W });
  transposeUniformInv0.write({ srcCols: W, srcRows: H });
  transposeUniformInv1.write({ srcCols: H, srcRows: W });
  transposeUniformInvAux.write({ srcCols: H, srcRows: W });

  let resultInA = true;

  function inverseFromSkipSpectrumDirect(computePass: GPUComputePassEncoder) {
    let inA = resultInA;

    inA = lineFft.dispatchLineFft(H, W, inA, { computePass, inverse: true, lineUniformSlot: 3 });

    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairInvAux, inA),
      H,
      W,
      computePass,
    );
    inA = !inA;

    inA = lineFft.dispatchLineFft(W, H, inA, { computePass, inverse: true, lineUniformSlot: 2 });

    resultInA = inA;
  }

  function applyRows1DForward(inA: boolean, computePass: GPUComputePassEncoder): boolean {
    return lineFft.dispatchLineFft(W, H, inA, { computePass });
  }

  function applyRows1DInversePass(inA: boolean, computePass: GPUComputePassEncoder): boolean {
    return lineFft.dispatchLineFft(W, H, inA, {
      computePass,
      inverse: true,
      lineUniformSlot: 2,
    });
  }

  function applyColumns1DForward(inA: boolean, computePass: GPUComputePassEncoder): boolean {
    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairFwd0, inA),
      W,
      H,
      computePass,
    );
    const afterTInA = !inA;

    const midInA = lineFft.dispatchLineFft(H, W, afterTInA, { computePass, lineUniformSlot: 1 });

    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairFwd1, midInA),
      H,
      W,
      computePass,
    );
    return !midInA;
  }

  function applyColumns1DInversePass(inA: boolean, computePass: GPUComputePassEncoder): boolean {
    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairInv0, inA),
      W,
      H,
      computePass,
    );
    const afterTInA = !inA;

    const midInA = lineFft.dispatchLineFft(H, W, afterTInA, {
      computePass,
      inverse: true,
      lineUniformSlot: 3,
    });

    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairInv1, midInA),
      H,
      W,
      computePass,
    );
    return !midInA;
  }

  function applyColumns1DForwardLeavingTransposed(
    inA: boolean,
    computePass: GPUComputePassEncoder,
  ): boolean {
    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairFwd0, inA),
      W,
      H,
      computePass,
    );
    const afterTInA = !inA;
    return lineFft.dispatchLineFft(H, W, afterTInA, { computePass, lineUniformSlot: 1 });
  }

  function forwardFromFullInverse(initialInA: boolean, computePass: GPUComputePassEncoder) {
    let inA = initialInA;
    inA = applyRows1DInversePass(inA, computePass);
    inA = applyColumns1DInversePass(inA, computePass);
    resultInA = inA;
  }

  function forwardFrom(initialInA: boolean, computePass: GPUComputePassEncoder) {
    let inA = initialInA;
    inA = applyRows1DForward(inA, computePass);
    inA = skipFinalTranspose
      ? applyColumns1DForwardLeavingTransposed(inA, computePass)
      : applyColumns1DForward(inA, computePass);
    resultInA = inA;
  }

  function retileSpectrumToNaturalInternal(computePass: GPUComputePassEncoder) {
    if (!skipFinalTranspose) {
      return;
    }
    const inA = resultInA;
    dispatchTranspose(
      transposePipeline,
      pickTransposeBg(transposePairInvAux, inA),
      H,
      W,
      computePass,
    );
    resultInA = !inA;
  }

  return {
    width: W,
    height: H,
    skipFinalTranspose,
    input: bufA,
    buffers: [bufA, bufB] as const,
    outputIndex(): 0 | 1 {
      return resultInA ? 0 : 1;
    },
    output() {
      return resultInA ? bufA : bufB;
    },
    encodeForward(computePass) {
      forwardFrom(true, computePass);
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
      transposeUniformFwd0.destroy();
      transposeUniformFwd1.destroy();
      transposeUniformInv0.destroy();
      transposeUniformInv1.destroy();
      transposeUniformInvAux.destroy();
    },
  };
}
