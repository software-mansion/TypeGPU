import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamStagePipeline,
  stockhamLayout,
  stockhamUniformType,
} from './stockham.ts';
import {
  createRadix4InverseStagePipeline,
  createRadix4StagePipeline,
  dispatchRadix4LineFft,
  maxRadix4PassCount,
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

  const radix4PassPool = maxRadix4PassCount(nMax);
  const radix4Pipeline = createRadix4StagePipeline(root);
  const radix4InversePipeline = createRadix4InverseStagePipeline(root);
  const stockhamPipeline = createStockhamStagePipeline(root);

  const twiddleLutLen = nMax - 1;
  const twiddleLut = root.createBuffer(d.arrayOf(d.vec2f, twiddleLutLen)).$usage('storage');
  twiddleLut.write(buildStockhamTwiddleLut(nMax).map(([x, y]) => d.vec2f(x, y)));

  function createRadix4Pool() {
    const radix4StageUniforms = Array.from({ length: radix4PassPool }, () =>
      root.createBuffer(radix4UniformType).$usage('uniform'),
    );
    const radix4BgSrcA = radix4StageUniforms.map((uniforms) =>
      root.createBindGroup(radix4Layout, {
        uniforms,
        src: bufA,
        dst: bufB,
      }),
    );
    const radix4BgSrcB = radix4StageUniforms.map((uniforms) =>
      root.createBindGroup(radix4Layout, {
        uniforms,
        src: bufB,
        dst: bufA,
      }),
    );
    const stockhamTailUniform = root.createBuffer(stockhamUniformType).$usage('uniform');
    const stockhamTailBgSrcA = root.createBindGroup(stockhamLayout, {
      uniforms: stockhamTailUniform,
      twiddles: twiddleLut,
      src: bufA,
      dst: bufB,
    });
    const stockhamTailBgSrcB = root.createBindGroup(stockhamLayout, {
      uniforms: stockhamTailUniform,
      twiddles: twiddleLut,
      src: bufB,
      dst: bufA,
    });
    return {
      radix4StageUniforms,
      radix4BgSrcA,
      radix4BgSrcB,
      stockhamTailUniform,
      stockhamTailBgSrcA,
      stockhamTailBgSrcB,
    };
  }

  const radix4Pools = [
    createRadix4Pool(),
    createRadix4Pool(),
    createRadix4Pool(),
    createRadix4Pool(),
  ] as const;

  function profileLineFft(args: LineFftProfileArgs): LineFftProfileResult {
    const s = args.lineUniformSlot ?? 0;
    const slot = s >= 0 && s <= 3 ? s : 0;
    const pool = radix4Pools.at(slot);
    if (pool === undefined) {
      throw new Error('@typegpu/fft: invalid lineUniformSlot for radix-4 profile');
    }
    const radix4StageUniforms = pool.radix4StageUniforms;
    const radix4BgSrcA = pool.radix4BgSrcA;
    const radix4BgSrcB = pool.radix4BgSrcB;
    const stockhamTailUniform = pool.stockhamTailUniform;
    const stockhamTailBgSrcA = pool.stockhamTailBgSrcA;
    const stockhamTailBgSrcB = pool.stockhamTailBgSrcB;

    const inverse = args.mode === 'inverse';
    const direction = inverse ? 1 : 0;
    const totalThreadsS = args.numLines * (args.n >> 1);
    const [wxS, wyS, wzS] = decomposeWorkgroups(Math.ceil(totalThreadsS / STOCKHAM_WG));

    let idx = args.queryIndexStart;
    let inA = args.inputInA;

    const k = 31 - Math.clz32(args.n);
    const ps = radix4PValues(args.n);
    const quarter = args.n >> 2;
    const totalThreadsR4 = args.numLines * quarter;
    const [wxR, wyR, wzR] = decomposeWorkgroups(Math.ceil(totalThreadsR4 / STOCKHAM_WG));

    if (inverse) {
      const submitStockhamTailInverse = () => {
        stockhamTailUniform.write({
          ns: args.n >> 1,
          n: args.n,
          lineStride: args.lineStride,
          numLines: args.numLines,
          direction,
        });
        const bg = inA ? stockhamTailBgSrcA : stockhamTailBgSrcB;
        const enc = args.device.createCommandEncoder({
          label: `fft2d stockham tail inverse ${args.mode}`,
        });
        const pass = enc.beginComputePass({
          label: 'fft2d line Stockham tail inverse',
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
        stockhamPipeline.with(pass).with(bg).dispatchWorkgroups(wxS, wyS, wzS);
        pass.end();
        args.device.queue.submit([enc.finish()]);
        inA = !inA;
        idx += 2;
      };

      const submitRadix4Inverse = (stageIndex: number) => {
        const p = ps[stageIndex]!;
        radix4StageUniforms[stageIndex]!.write({
          p,
          n: args.n,
          lineStride: args.lineStride,
          numLines: args.numLines,
        });
        const bg = inA ? radix4BgSrcA[stageIndex]! : radix4BgSrcB[stageIndex]!;
        const enc = args.device.createCommandEncoder({ label: `fft2d radix4 line inverse ${args.mode}` });
        const pass = enc.beginComputePass({
          label: 'fft2d line radix4 inverse',
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
        radix4InversePipeline.with(pass).with(bg).dispatchWorkgroups(wxR, wyR, wzR);
        pass.end();
        args.device.queue.submit([enc.finish()]);
        inA = !inA;
        idx += 2;
      };

      if (k % 2 === 1) {
        submitStockhamTailInverse();
      }
      for (let s = ps.length - 1; s >= 0; s--) {
        submitRadix4Inverse(s);
      }
      return { queryIndexEnd: idx, resultInA: inA };
    }

    const submitRadix4 = (stageIndex: number) => {
      const p = ps[stageIndex]!;
      radix4StageUniforms[stageIndex]!.write({
        p,
        n: args.n,
        lineStride: args.lineStride,
        numLines: args.numLines,
      });
      const bg = inA ? radix4BgSrcA[stageIndex]! : radix4BgSrcB[stageIndex]!;
      const enc = args.device.createCommandEncoder({ label: `fft2d radix4 line ${args.mode}` });
      const pass = enc.beginComputePass({
        label: 'fft2d line radix4',
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
      radix4Pipeline.with(pass).with(bg).dispatchWorkgroups(wxR, wyR, wzR);
      pass.end();
      args.device.queue.submit([enc.finish()]);
      inA = !inA;
      idx += 2;
    };

    const submitStockhamTail = () => {
      stockhamTailUniform.write({
        ns: args.n >> 1,
        n: args.n,
        lineStride: args.lineStride,
        numLines: args.numLines,
        direction,
      });
      const bg = inA ? stockhamTailBgSrcA : stockhamTailBgSrcB;
      const enc = args.device.createCommandEncoder({ label: `fft2d stockham tail ${args.mode}` });
      const pass = enc.beginComputePass({
        label: 'fft2d line Stockham tail',
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
      stockhamPipeline.with(pass).with(bg).dispatchWorkgroups(wxS, wyS, wzS);
      pass.end();
      args.device.queue.submit([enc.finish()]);
      inA = !inA;
      idx += 2;
    };

    for (let s = 0; s < ps.length; s++) {
      submitRadix4(s);
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
      const merged: LineFftEncodeOptions = {
        commandEncoder: options.commandEncoder,
        lineUniformSlot: (() => {
          const s = options.lineUniformSlot ?? 0;
          return s >= 0 && s <= 3 ? s : 0;
        })(),
        ...(options.inverse === true ? { inverse: true as const } : {}),
        ...(options.inverseMaxStages !== undefined
          ? { inverseMaxStages: options.inverseMaxStages }
          : {}),
      };
      return dispatchRadix4LineFft(
        radix4Pipeline,
        radix4InversePipeline,
        stockhamPipeline,
        radix4Pools,
        n,
        lineStride,
        numLines,
        inputInA,
        merged,
      );
    },
    profileLineFft,
    destroy() {
      twiddleLut.destroy();
      for (const p of radix4Pools) {
        for (const u of p.radix4StageUniforms) {
          u.destroy();
        }
        p.stockhamTailUniform.destroy();
      }
    },
  };
}
