import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamStagePipeline,
  dispatchStockhamLineFftStages,
  stockhamLayout,
  stockhamNsValues,
  stockhamUniformType,
} from './stockham.ts';
import {
  createRadix4StagePipeline,
  dispatchRadix4LineFft,
  radix4Layout,
  radix4LineStageCount,
  radix4UniformType,
} from './stockhamRadix4.ts';
import type {
  LineFftEncodeOptions,
  LineFftProfileArgs,
  LineFftProfileResult,
  LineFftStrategy,
  LineFftStrategyFactoryContext,
} from './lineFftStrategy.ts';
import { decomposeWorkgroups } from './utils.ts';

const STOCKHAM_WG = 256;

function lineFftEncodeOpts(
  computePass?: GPUComputePassEncoder,
  inverse?: boolean,
): LineFftEncodeOptions | undefined {
  if (computePass !== undefined) {
    return inverse ? { computePass, inverse: true } : { computePass };
  }
  return inverse ? { inverse: true as const } : undefined;
}

function radix4PValues(n: number): number[] {
  const r4 = Math.floor((31 - Math.clz32(n)) / 2);
  const ps: number[] = [];
  let p = 1;
  for (let s = 0; s < r4; s++) {
    ps.push(p);
    p *= 4;
  }
  return ps;
}

/**
 * Radix-4 (Bainville) line stages + optional single radix-2 Stockham tail when `log₂(n)` is odd.
 * Fewer global passes than pure radix-2 Stockham for long lines.
 */
export function createStockhamRadix4LineStrategy(
  ctx: LineFftStrategyFactoryContext,
): LineFftStrategy {
  const { root, nMax, bufA, bufB } = ctx;

  const radix4Uniform = root.createBuffer(radix4UniformType).$usage('uniform');
  const radix4Pipeline = createRadix4StagePipeline(root);
  const radix4BgSrcA = root.createBindGroup(radix4Layout, {
    uniforms: radix4Uniform,
    src: bufA,
    dst: bufB,
  });
  const radix4BgSrcB = root.createBindGroup(radix4Layout, {
    uniforms: radix4Uniform,
    src: bufB,
    dst: bufA,
  });

  const twiddleLutLen = nMax - 1;
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
    const totalThreadsS = args.numLines * (args.n >> 1);
    const [wxS, wyS, wzS] = decomposeWorkgroups(Math.ceil(totalThreadsS / STOCKHAM_WG));

    let idx = args.queryIndexStart;
    let inA = args.inputInA;

    if (inverse) {
      for (const ns of stockhamNsValues(args.n)) {
        stockhamUniform.write({
          ns,
          n: args.n,
          lineStride: args.lineStride,
          numLines: args.numLines,
          direction,
        });
        const bg = inA ? stockhamBgSrcA : stockhamBgSrcB;
        const enc = args.device.createCommandEncoder({ label: `fft2d line FFT inverse (Stockham) stage` });
        const pass = enc.beginComputePass({
          label: 'fft2d line Stockham inverse',
          timestampWrites: {
            querySet: args.querySet,
            beginningOfPassWriteIndex: idx,
            endOfPassWriteIndex: idx + 1,
          },
        });
        stockhamPipeline.with(pass).with(bg).dispatchWorkgroups(wxS, wyS, wzS);
        pass.end();
        args.device.queue.submit([enc.finish()]);
        inA = !inA;
        idx += 2;
      }
      return { queryIndexEnd: idx, resultInA: inA };
    }

    const k = 31 - Math.clz32(args.n);
    const ps = radix4PValues(args.n);
    const quarter = args.n >> 2;
    const totalThreadsR4 = args.numLines * quarter;
    const [wxR, wyR, wzR] = decomposeWorkgroups(Math.ceil(totalThreadsR4 / STOCKHAM_WG));

    const submitRadix4 = (p: number) => {
      radix4Uniform.write({
        p,
        n: args.n,
        lineStride: args.lineStride,
        numLines: args.numLines,
        direction,
      });
      const bg = inA ? radix4BgSrcA : radix4BgSrcB;
      const enc = args.device.createCommandEncoder({ label: `fft2d radix4 line ${args.mode}` });
      const pass = enc.beginComputePass({
        label: 'fft2d line radix4',
        timestampWrites: {
          querySet: args.querySet,
          beginningOfPassWriteIndex: idx,
          endOfPassWriteIndex: idx + 1,
        },
      });
      radix4Pipeline.with(pass).with(bg).dispatchWorkgroups(wxR, wyR, wzR);
      pass.end();
      args.device.queue.submit([enc.finish()]);
      inA = !inA;
      idx += 2;
    };

    const submitStockhamTail = () => {
      stockhamUniform.write({
        ns: args.n >> 1,
        n: args.n,
        lineStride: args.lineStride,
        numLines: args.numLines,
        direction,
      });
      const bg = inA ? stockhamBgSrcA : stockhamBgSrcB;
      const enc = args.device.createCommandEncoder({ label: `fft2d stockham tail ${args.mode}` });
      const pass = enc.beginComputePass({
        label: 'fft2d line Stockham tail',
        timestampWrites: {
          querySet: args.querySet,
          beginningOfPassWriteIndex: idx,
          endOfPassWriteIndex: idx + 1,
        },
      });
      stockhamPipeline.with(pass).with(bg).dispatchWorkgroups(wxS, wyS, wzS);
      pass.end();
      args.device.queue.submit([enc.finish()]);
      inA = !inA;
      idx += 2;
    };

    for (const p of ps) {
      submitRadix4(p);
    }
    if (k % 2 === 1) {
      submitStockhamTail();
    }

    return { queryIndexEnd: idx, resultInA: inA };
  }

  return {
    id: 'stockham-radix4',
    stageCount: radix4LineStageCount,
    dispatchLineFft(n, lineStride, numLines, inputInA, options) {
      return dispatchRadix4LineFft(
        radix4Pipeline,
        radix4Uniform,
        stockhamPipeline,
        stockhamUniform,
        n,
        lineStride,
        numLines,
        inputInA,
        radix4BgSrcA,
        radix4BgSrcB,
        stockhamBgSrcA,
        stockhamBgSrcB,
        lineFftEncodeOpts(options?.computePass, options?.inverse),
      );
    },
    profileLineFft,
    destroy() {
      twiddleLut.destroy();
      radix4Uniform.destroy();
      stockhamUniform.destroy();
    },
  };
}
