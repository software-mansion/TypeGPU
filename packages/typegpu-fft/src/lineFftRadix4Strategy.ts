import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamDifStagePipeline,
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
import type { LineFftEncodeOptions, LineFftStrategy, LineFftStrategyFactoryContext } from './lineFftStrategy.ts';

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
  const stockhamDifPipeline = createStockhamDifStagePipeline(root);

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

  return {
    id: 'stockham-radix4',
    stageCount: radix4LineStageCount,
    dispatchLineFft(n, lineStride, numLines, inputInA, options) {
      const merged: LineFftEncodeOptions = {
        computePass: options.computePass,
        lineUniformSlot: (() => {
          const s = options.lineUniformSlot ?? 0;
          return s >= 0 && s <= 3 ? s : 0;
        })(),
        ...(options.inverse === true ? { inverse: true as const } : {}),
      };
      return dispatchRadix4LineFft(
        radix4Pipeline,
        radix4InversePipeline,
        stockhamPipeline,
        stockhamDifPipeline,
        radix4Pools,
        n,
        lineStride,
        numLines,
        inputInA,
        merged,
      );
    },
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
