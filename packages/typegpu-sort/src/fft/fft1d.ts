import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import { d } from 'typegpu';
import {
  complexVec2ScaleLayout,
  complexVec2ScaleUniformType,
  createComplexVec2ScalePipeline,
} from './complexVec2Scale.ts';
import type { LineFftStrategyFactory } from './lineFftStrategy.ts';
import { createStockhamRadix4LineStrategy } from './lineFftRadix4Strategy.ts';
import { decomposeWorkgroups } from './utils.ts';

export type Fft1dOptions = {
  /** Line length; must be a power of two. */
  n: number;
  /**
   * Number of parallel 1D FFTs packed contiguously: line `ℓ` occupies indices `ℓ·n` … `(ℓ+1)·n − 1`
   * (`vec2` samples). Defaults to `1`.
   */
  numLines?: number;
  /**
   * Pluggable line FFT (Stockham-style along contiguous lines). Default: radix-4 + optional radix-2 tail
   * via {@link createStockhamRadix4LineStrategy}.
   */
  lineFftStrategyFactory?: LineFftStrategyFactory;
};

export type Fft1d = {
  readonly n: number;
  readonly numLines: number;
  /**
   * Complex samples `vec2(re, im)` before {@link Fft1d.encodeForward}: line-major, `buffers[0]`,
   * length `n * numLines`.
   */
  readonly input: TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  readonly buffers: readonly [
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
    TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag,
  ];
  outputIndex(): 0 | 1;
  output(): TgpuBuffer<d.WgslArray<d.Vec2f>> & StorageFlag;
  /**
   * Forward: unnormalized complex DFT (typical FFT convention). Line stages use `1/√n` internally for
   * stability, then the buffer is scaled to standard DFT units.
   */
  encodeForward(computePass: GPUComputePassEncoder): void;
  /** Inverse of {@link encodeForward}; expects the same spectrum units. */
  encodeInverse(computePass: GPUComputePassEncoder): void;
  destroy(): void;
};

/**
 * 1D complex FFT on a contiguous `vec2` buffer: `numLines` parallel transforms of length `n` (power of two),
 * each line stored as `n` consecutive complex samples. Spectrum is the **unnormalized** DFT (same convention as
 * common CPU FFT libraries). GPU work is recorded on a caller-owned {@link GPUComputePassEncoder}.
 */
export function createFft1d(root: TgpuRoot, options: Fft1dOptions): Fft1d {
  const n = options.n;
  const numLines = options.numLines ?? 1;
  const lineFftFactory = options.lineFftStrategyFactory ?? createStockhamRadix4LineStrategy;

  if (n <= 0 || numLines <= 0 || !Number.isInteger(numLines)) {
    throw new Error('FFT 1D: n and numLines must be positive integers');
  }
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT 1D: n must be a power of two (got ${n})`);
  }

  const count = n * numLines;
  const bufA = root.createBuffer(d.arrayOf(d.vec2f, count)).$usage('storage');
  const bufB = root.createBuffer(d.arrayOf(d.vec2f, count)).$usage('storage');

  const lineFft = lineFftFactory({
    root,
    nMax: n,
    width: n,
    height: numLines,
    bufA,
    bufB,
  });

  const invSqrtN = 1 / Math.sqrt(n);
  const spectrumToStandardUnits = Math.sqrt(n);
  const spectrumFromStandardUnits = 1 / spectrumToStandardUnits;

  const scalePipeline = createComplexVec2ScalePipeline(root);

  const scaleUpUniform = root.createBuffer(complexVec2ScaleUniformType).$usage('uniform');
  scaleUpUniform.write({ scale: spectrumToStandardUnits });
  const scaleUpBgAtoB = root.createBindGroup(complexVec2ScaleLayout, {
    uniforms: scaleUpUniform,
    src: bufA,
    dst: bufB,
  });
  const scaleUpBgBtoA = root.createBindGroup(complexVec2ScaleLayout, {
    uniforms: scaleUpUniform,
    src: bufB,
    dst: bufA,
  });

  const scaleDownUniform = root.createBuffer(complexVec2ScaleUniformType).$usage('uniform');
  scaleDownUniform.write({ scale: spectrumFromStandardUnits });
  const scaleDownBgAtoB = root.createBindGroup(complexVec2ScaleLayout, {
    uniforms: scaleDownUniform,
    src: bufA,
    dst: bufB,
  });
  const scaleDownBgBtoA = root.createBindGroup(complexVec2ScaleLayout, {
    uniforms: scaleDownUniform,
    src: bufB,
    dst: bufA,
  });

  function scaleUp(inputInA: boolean, computePass: GPUComputePassEncoder): boolean {
    const bg = inputInA ? scaleUpBgAtoB : scaleUpBgBtoA;
    scalePipeline
      .with(computePass)
      .with(bg)
      .dispatchWorkgroups(...decomposeWorkgroups(Math.ceil(count / 256)));
    return !inputInA;
  }

  function scaleDown(inputInA: boolean, computePass: GPUComputePassEncoder): boolean {
    const bg = inputInA ? scaleDownBgAtoB : scaleDownBgBtoA;
    scalePipeline
      .with(computePass)
      .with(bg)
      .dispatchWorkgroups(...decomposeWorkgroups(Math.ceil(count / 256)));
    return !inputInA;
  }

  let resultInA = true;

  return {
    n,
    numLines,
    input: bufA,
    buffers: [bufA, bufB] as const,
    outputIndex(): 0 | 1 {
      return resultInA ? 0 : 1;
    },
    output() {
      return resultInA ? bufA : bufB;
    },
    encodeForward(computePass) {
      resultInA = lineFft.dispatchLineFft(n, numLines, true, {
        computePass,
        lastPassOrthonormalScale: invSqrtN,
      });
      resultInA = scaleUp(resultInA, computePass);
    },
    encodeInverse(computePass) {
      resultInA = scaleDown(resultInA, computePass);
      resultInA = lineFft.dispatchLineFft(n, numLines, resultInA, {
        computePass,
        inverse: true,
        lineUniformSlot: 2,
        firstPassOrthonormalScale: invSqrtN,
      });
    },
    destroy() {
      lineFft.destroy();
      bufA.destroy();
      bufB.destroy();
      scaleUpUniform.destroy();
      scaleDownUniform.destroy();
    },
  };
}
