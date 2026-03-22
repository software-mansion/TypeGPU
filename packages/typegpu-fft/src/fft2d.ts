import type { StorageFlag, TgpuBindGroup, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import { d } from 'typegpu';
import {
  createStockhamRadix2LineStrategy,
  type LineFftEncodeOptions,
  type LineFftStrategyFactory,
} from './lineFftStrategy.ts';
import { stockhamStageCount } from './stockham.ts';
import {
  createTransposePipeline,
  dispatchTranspose,
  transposeLayout,
  transposeUniformType,
} from './transpose.ts';

function makeLineFftOpts(debugInverseMaxLineStages: number | undefined) {
  return function lineFftOpts(
    commandEncoder: GPUCommandEncoder,
    extras?: { inverse?: boolean; lineUniformSlot?: 0 | 1 | 2 | 3 },
  ): LineFftEncodeOptions {
    const inverse = extras?.inverse === true;
    const lineUniformSlot = extras?.lineUniformSlot ?? 0;
    const cap =
      inverse && debugInverseMaxLineStages !== undefined
        ? debugInverseMaxLineStages
        : undefined;
    if (inverse) {
      return cap !== undefined
        ? { commandEncoder, inverse: true as const, inverseMaxStages: cap, lineUniformSlot }
        : { commandEncoder, inverse: true as const, lineUniformSlot };
    }
    return { commandEncoder, lineUniformSlot };
  };
}

function recordTransposePass(
  encoder: GPUCommandEncoder,
  label: string,
  pipeline: ReturnType<typeof createTransposePipeline>,
  uniformBuffer: TgpuBuffer<typeof transposeUniformType> & UniformFlag,
  bindGroup: TgpuBindGroup<(typeof transposeLayout)['entries']>,
  srcCols: number,
  srcRows: number,
): void {
  const p = encoder.beginComputePass({ label });
  dispatchTranspose(pipeline, uniformBuffer, bindGroup, srcCols, srcRows, p);
  p.end();
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
   * Callers must interpret filters / indexing accordingly, or call {@link Fft2d.encodeRetileSpectrumToNatural}
   * for natural spectrum layout. {@link Fft2d.encodeInverse} does not retile when this is set; it uses a
   * factored inverse on the skip layout.
   */
  skipFinalTranspose?: boolean;
  /**
   * Pluggable 1D line FFT (Stockham along contiguous lines). Default: radix-2 Stockham via
   * {@link createStockhamRadix2LineStrategy}.
   */
  lineFftStrategyFactory?: LineFftStrategyFactory;
  /**
   * Debug: each inverse line-FFT dispatch runs at most this many internal stages (same semantics as
   * `LineFftEncodeOptions.inverseMaxStages` in this package). Omit for a full inverse.
   */
  debugInverseMaxLineStages?: number;
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

export type EncodeForwardPerStageSubmitsOptions = {
  /** @default 1 — only radix-2 Stockham `profileLineFft` honors this. */
  lineStagesPerSubmit?: number;
};

export type Fft2d = {
  readonly width: number;
  readonly height: number;
  readonly useGlobalTranspose: boolean;
  readonly skipFinalTranspose: boolean;
  readonly lineFftStrategyId: string;
  /**
   * Write complex samples `vec2(re, im)` before {@link Fft2d.encodeForward} (row-major: `y * width + x`).
   * Same buffer as `pingPong[0]`.
   */
  readonly input: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  readonly pingPong: readonly [
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
  ];
  outputSlot(): 0 | 1;
  /** Buffer that holds the result of the last encode pass (same indexing). */
  output(): TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;

  encodeTransformRows1DForward(commandEncoder: GPUCommandEncoder): void;
  encodeTransformRows1DInverse(commandEncoder: GPUCommandEncoder): void;
  encodeTransformColumns1DForward(commandEncoder: GPUCommandEncoder): void;
  encodeTransformColumns1DInverse(commandEncoder: GPUCommandEncoder): void;
  /**
   * Full 2D forward from {@link input} (`pingPong[0]`). Records multiple compute passes on `commandEncoder`
   * (one per line-FFT stage and per transpose); caller `finish`es and `submit`s.
   */
  encodeForward(commandEncoder: GPUCommandEncoder): void;
  /**
   * Same result as {@link Fft2d.encodeForward}, but uses one queue submit after the row 1D FFT and one
   * after the column phase (transpose + column FFT and optional final transpose). Optional scheduling
   * variant; dual uniform pools make single-submit {@link Fft2d.encodeForward} correct for non-square sizes.
   */
  encodeForwardSplitSubmits(device: GPUDevice): void;
  /**
   * Same result as {@link Fft2d.encodeForward}, with two submits at a different boundary: first submit runs
   * row 1D FFT, W×H transpose, and column 1D FFT; second submit runs only the final H×W transpose. If
   * {@link Fft2d.skipFinalTranspose} is set, behaves like {@link Fft2d.encodeForwardSplitSubmits} (no final
   * transpose to split).
   */
  encodeForwardSplitSubmitsThroughColumn(device: GPUDevice): void;
  /**
   * Same result as {@link Fft2d.encodeInverse}, with a queue submit between major phases (skip-final:
   * column inverse, transpose, row inverse; otherwise: retile, row inverse, column inverse).
   */
  encodeInverseSplitSubmits(device: GPUDevice): void;
  /**
   * Same result as {@link Fft2d.encodeForward}, with one queue submit per line-FFT stage and per transpose
   * (same recording path as {@link Fft2d.profileForward} but **no** timestamp queries).
   * Pass `opts.lineStagesPerSubmit` greater than 1 to merge consecutive radix-2 Stockham line-FFT stages into one
   * submit (other line strategies ignore this field).
   */
  encodeForwardPerStageSubmits(
    device: GPUDevice,
    opts?: EncodeForwardPerStageSubmitsOptions,
  ): void;
  /**
   * Same result as {@link Fft2d.encodeForward}, with one queue submit per line-FFT stage and per transpose.
   * Each submit uses a compute pass with `timestampWrites` for two query indices (begin/end).
   */
  profileForward(device: GPUDevice, querySet: GPUQuerySet, timestampBaseIndex: number): void;
  encodeRetileSpectrumToNatural(commandEncoder: GPUCommandEncoder): void;
  /**
   * Inverse DFT of the spectrum from the last forward (same ping-pong buffers). Multiple compute passes on
   * `commandEncoder`; caller `finish`es and `submit`s.
   */
  encodeInverse(commandEncoder: GPUCommandEncoder): void;
  destroy(): void;
};

/**
 * Radix-2 Stockham 2D FFT on row-major `width×height` complex buffers (`input` = `pingPong[0]`).
 * All GPU work is recorded through {@link Fft2d.encodeForward} / {@link Fft2d.encodeInverse} (or the
 * `encodeTransform*` helpers) on a caller-owned {@link GPUCommandEncoder}.
 *
 * WebGPU allows many `dispatchWorkgroups` calls (and pipeline switches) in **one** compute pass; this
 * package still uses **one short compute pass per FFT stage / transpose** so each dispatch is isolated and
 * `queue.writeBuffer` updates to per-stage uniforms are easy to reason about before a single `submit`.
 *
 * Recording does not execute work. Uniform updates use `queue.writeBuffer` (ordered on the queue before
 * submitted command buffers). Batch dependent work in **one** encoder (e.g. fill pass then
 * {@link Fft2d.encodeForward}) then submit once.
 *
 * Line strategies use **two duplicate uniform pools** (slot `0` = row-axis, `1` = column-axis) so each
 * Stockham / radix-4 stage index maps to distinct GPU buffers for row vs column passes. That avoids
 * `queue.writeBuffer` last-write-wins across axes when {@link Fft2d.encodeForward} records both passes on
 * one encoder before `submit`. Two transpose uniform buffers still cover the column pass’s two transposes
 * when both are recorded back-to-back on the same encoder.
 */
export function createFft2d(root: TgpuRoot, options: Fft2dOptions): Fft2d {
  const { width: W, height: H } = options;
  const useGlobalTranspose = options.useGlobalTranspose !== false;
  const skipFinalTranspose = options.skipFinalTranspose === true;
  const lineFftFactory = options.lineFftStrategyFactory ?? createStockhamRadix2LineStrategy;
  const lineFftOpts = makeLineFftOpts(options.debugInverseMaxLineStages);

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
  const lineFft = lineFftFactory({ root, nMax, bufA, bufB });

  const transposeUniformFwd0 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformFwd1 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformInv0 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformInv1 = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposeUniformInvAux = root.createBuffer(transposeUniformType).$usage('uniform');
  const transposePipeline = createTransposePipeline(root);

  type TransposeBgPair = {
    bgSrcA: TgpuBindGroup<(typeof transposeLayout)['entries']>;
    bgSrcB: TgpuBindGroup<(typeof transposeLayout)['entries']>;
  };
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

  function pickTransposeBg(pair: TransposeBgPair, inA: boolean): TgpuBindGroup<(typeof transposeLayout)['entries']> {
    return inA ? pair.bgSrcA : pair.bgSrcB;
  }

  let resultInA = true;

  function inverseFromSkipSpectrumDirect(encoder: GPUCommandEncoder) {
    let inA = resultInA;

    inA = lineFft.dispatchLineFft(H, H, W, inA, lineFftOpts(encoder, { inverse: true, lineUniformSlot: 3 }));

    recordTransposePass(
      encoder,
      'fft2d inverse skip-layout transpose H×W',
      transposePipeline,
      transposeUniformInvAux,
      pickTransposeBg(transposePairInvAux, inA),
      H,
      W,
    );
    inA = !inA;

    inA = lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(encoder, { inverse: true, lineUniformSlot: 2 }));

    resultInA = inA;
  }

  function assertGlobalTranspose(method: string) {
    if (!useGlobalTranspose) {
      throw new Error(
        `@typegpu/fft: ${method} requires \`useGlobalTranspose: true\` until strided column FFT is implemented (set useGlobalTranspose: false is reserved).`,
      );
    }
  }

  function applyRows1DForward(inA: boolean, encoder: GPUCommandEncoder): boolean {
    return lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(encoder));
  }

  function applyRows1DInversePass(inA: boolean, encoder: GPUCommandEncoder): boolean {
    return lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(encoder, { inverse: true, lineUniformSlot: 0 }));
  }

  function applyColumns1DForward(inA: boolean, encoder: GPUCommandEncoder): boolean {
    assertGlobalTranspose('applyColumns1DForward');
    recordTransposePass(
      encoder,
      'fft2d transpose W×H',
      transposePipeline,
      transposeUniformFwd0,
      pickTransposeBg(transposePairFwd0, inA),
      W,
      H,
    );
    const afterTInA = !inA;

    const midInA = lineFft.dispatchLineFft(H, H, W, afterTInA, lineFftOpts(encoder, { lineUniformSlot: 1 }));

    recordTransposePass(
      encoder,
      'fft2d transpose H×W',
      transposePipeline,
      transposeUniformFwd1,
      pickTransposeBg(transposePairFwd1, midInA),
      H,
      W,
    );
    return !midInA;
  }

  function applyColumns1DInversePass(inA: boolean, encoder: GPUCommandEncoder): boolean {
    assertGlobalTranspose('applyColumns1DInversePass');
    recordTransposePass(
      encoder,
      'fft2d inverse transpose W×H',
      transposePipeline,
      transposeUniformInv0,
      pickTransposeBg(transposePairInv0, inA),
      W,
      H,
    );
    const afterTInA = !inA;

    const midInA = lineFft.dispatchLineFft(H, H, W, afterTInA, lineFftOpts(encoder, { inverse: true, lineUniformSlot: 3 }));

    recordTransposePass(
      encoder,
      'fft2d inverse transpose H×W',
      transposePipeline,
      transposeUniformInv1,
      pickTransposeBg(transposePairInv1, midInA),
      H,
      W,
    );
    return !midInA;
  }

  function applyColumns1DForwardLeavingTransposed(inA: boolean, encoder: GPUCommandEncoder): boolean {
    assertGlobalTranspose('applyColumns1DForwardLeavingTransposed');
    recordTransposePass(
      encoder,
      'fft2d transpose W×H (skip final)',
      transposePipeline,
      transposeUniformFwd0,
      pickTransposeBg(transposePairFwd0, inA),
      W,
      H,
    );
    const afterTInA = !inA;
    return lineFft.dispatchLineFft(H, H, W, afterTInA, lineFftOpts(encoder, { lineUniformSlot: 1 }));
  }

  function forwardFromFullInverse(initialInA: boolean, encoder: GPUCommandEncoder) {
    let inA = initialInA;
    inA = applyRows1DInversePass(inA, encoder);
    inA = applyColumns1DInversePass(inA, encoder);
    resultInA = inA;
  }

  function forwardFrom(initialInA: boolean, encoder: GPUCommandEncoder) {
    let inA = initialInA;
    inA = applyRows1DForward(inA, encoder);
    inA = skipFinalTranspose
      ? applyColumns1DForwardLeavingTransposed(inA, encoder)
      : applyColumns1DForward(inA, encoder);
    resultInA = inA;
  }

  function encodeForwardSplitSubmitsInternal(device: GPUDevice) {
    let inA = true;
    {
      const enc = device.createCommandEncoder({ label: 'fft2d forward rows' });
      inA = applyRows1DForward(inA, enc);
      resultInA = inA;
      device.queue.submit([enc.finish()]);
    }
    inA = resultInA;
    {
      const enc = device.createCommandEncoder({ label: 'fft2d forward columns' });
      inA = skipFinalTranspose
        ? applyColumns1DForwardLeavingTransposed(inA, enc)
        : applyColumns1DForward(inA, enc);
      resultInA = inA;
      device.queue.submit([enc.finish()]);
    }
  }

  /** Submit 1: row FFT + W×H transpose + column FFT. Submit 2: H×W transpose only (when not skip-final). */
  function encodeForwardSplitSubmitsThroughColumnInternal(device: GPUDevice) {
    if (skipFinalTranspose) {
      encodeForwardSplitSubmitsInternal(device);
      return;
    }
    let inA = true;
    {
      const enc = device.createCommandEncoder({ label: 'fft2d forward rows+transpose+col' });
      inA = applyRows1DForward(inA, enc);
      inA = applyColumns1DForwardLeavingTransposed(inA, enc);
      resultInA = inA;
      device.queue.submit([enc.finish()]);
    }
    inA = resultInA;
    {
      const enc = device.createCommandEncoder({ label: 'fft2d forward final transpose H×W' });
      recordTransposePass(
        enc,
        'fft2d transpose H×W',
        transposePipeline,
        transposeUniformFwd1,
        pickTransposeBg(transposePairFwd1, inA),
        H,
        W,
      );
      resultInA = !inA;
      device.queue.submit([enc.finish()]);
    }
  }

  function encodeInverseSplitSubmitsInternal(device: GPUDevice) {
    if (skipFinalTranspose) {
      let inA = resultInA;
      {
        const enc = device.createCommandEncoder({ label: 'fft2d inverse skip col' });
        inA = lineFft.dispatchLineFft(H, H, W, inA, lineFftOpts(enc, { inverse: true, lineUniformSlot: 1 }));
        resultInA = inA;
        device.queue.submit([enc.finish()]);
      }
      inA = resultInA;
      {
        const enc = device.createCommandEncoder({ label: 'fft2d inverse skip transpose' });
        recordTransposePass(
          enc,
          'fft2d inverse skip-layout transpose H×W',
          transposePipeline,
          transposeUniformInvAux,
          pickTransposeBg(transposePairInvAux, inA),
          H,
          W,
        );
        inA = !inA;
        resultInA = inA;
        device.queue.submit([enc.finish()]);
      }
      inA = resultInA;
      {
        const enc = device.createCommandEncoder({ label: 'fft2d inverse skip row' });
        inA = lineFft.dispatchLineFft(W, W, H, inA, lineFftOpts(enc, { inverse: true, lineUniformSlot: 0 }));
        resultInA = inA;
        device.queue.submit([enc.finish()]);
      }
    } else {
      {
        const enc = device.createCommandEncoder({ label: 'fft2d inverse retile' });
        retileSpectrumToNaturalInternal(enc);
        device.queue.submit([enc.finish()]);
      }
      let inA = resultInA;
      {
        const enc = device.createCommandEncoder({ label: 'fft2d inverse rows' });
        inA = applyRows1DInversePass(inA, enc);
        resultInA = inA;
        device.queue.submit([enc.finish()]);
      }
      inA = resultInA;
      {
        const enc = device.createCommandEncoder({ label: 'fft2d inverse columns' });
        inA = applyColumns1DInversePass(inA, enc);
        resultInA = inA;
        device.queue.submit([enc.finish()]);
      }
    }
  }

  function retileSpectrumToNaturalInternal(encoder: GPUCommandEncoder) {
    if (!skipFinalTranspose) {
      return;
    }
    const inA = resultInA;
    recordTransposePass(
      encoder,
      'fft2d retile spectrum H×W',
      transposePipeline,
      transposeUniformInvAux,
      pickTransposeBg(transposePairInvAux, inA),
      H,
      W,
    );
    resultInA = !inA;
  }

  function forwardFromProfiled(
    initialInA: boolean,
    gpuDevice: GPUDevice,
    querySet: GPUQuerySet | undefined,
    baseIndex: number,
    lineStagesPerSubmit = 1,
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
      ...(querySet !== undefined ? { querySet } : {}),
      queryIndexStart: idx,
      lineStagesPerSubmit,
      lineUniformSlot: 0,
    });
    idx = rowPr.queryIndexEnd;
    inA = rowPr.resultInA;

    {
      const enc = gpuDevice.createCommandEncoder({ label: 'fft2d transpose W×H' });
      const pass = enc.beginComputePass({
        label: 'fft2d transpose W×H',
        ...(querySet !== undefined
          ? {
              timestampWrites: {
                querySet,
                beginningOfPassWriteIndex: idx,
                endOfPassWriteIndex: idx + 1,
              },
            }
          : {}),
      });
      dispatchTranspose(
        transposePipeline,
        transposeUniformFwd0,
        pickTransposeBg(transposePairFwd0, inA),
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
      ...(querySet !== undefined ? { querySet } : {}),
      queryIndexStart: idx,
      lineStagesPerSubmit,
      lineUniformSlot: 1,
    });
    idx = colPr.queryIndexEnd;
    const colInA = colPr.resultInA;

    if (!skipFinalTranspose) {
      const enc = gpuDevice.createCommandEncoder({ label: 'fft2d transpose H×W' });
      const pass = enc.beginComputePass({
        label: 'fft2d transpose H×W',
        ...(querySet !== undefined
          ? {
              timestampWrites: {
                querySet,
                beginningOfPassWriteIndex: idx,
                endOfPassWriteIndex: idx + 1,
              },
            }
          : {}),
      });
      dispatchTranspose(
        transposePipeline,
        transposeUniformFwd1,
        pickTransposeBg(transposePairFwd1, colInA),
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
    encodeTransformRows1DForward(commandEncoder) {
      resultInA = applyRows1DForward(resultInA, commandEncoder);
    },
    encodeTransformRows1DInverse(commandEncoder) {
      resultInA = applyRows1DInversePass(resultInA, commandEncoder);
    },
    encodeTransformColumns1DForward(commandEncoder) {
      resultInA = applyColumns1DForward(resultInA, commandEncoder);
    },
    encodeTransformColumns1DInverse(commandEncoder) {
      resultInA = applyColumns1DInversePass(resultInA, commandEncoder);
    },
    encodeForward(commandEncoder) {
      forwardFrom(true, commandEncoder);
    },
    encodeForwardSplitSubmits(device) {
      encodeForwardSplitSubmitsInternal(device);
    },
    encodeForwardSplitSubmitsThroughColumn(device) {
      encodeForwardSplitSubmitsThroughColumnInternal(device);
    },
    encodeForwardPerStageSubmits(device, opts) {
      const lineStagesPerSubmit = Math.max(1, Math.floor(opts?.lineStagesPerSubmit ?? 1));
      forwardFromProfiled(true, device, undefined, 0, lineStagesPerSubmit);
    },
    encodeInverseSplitSubmits(device) {
      encodeInverseSplitSubmitsInternal(device);
    },
    profileForward(gpuDevice, querySet, timestampBaseIndex) {
      forwardFromProfiled(true, gpuDevice, querySet, timestampBaseIndex);
    },
    encodeRetileSpectrumToNatural(commandEncoder) {
      retileSpectrumToNaturalInternal(commandEncoder);
    },
    encodeInverse(commandEncoder) {
      if (skipFinalTranspose) {
        inverseFromSkipSpectrumDirect(commandEncoder);
      } else {
        retileSpectrumToNaturalInternal(commandEncoder);
        forwardFromFullInverse(resultInA, commandEncoder);
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
