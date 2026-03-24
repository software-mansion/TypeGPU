import type { TgpuBuffer, UniformFlag } from 'typegpu';
import { d } from 'typegpu';
import {
  buildStockhamTwiddleLut,
  createStockhamStagePipeline,
  dispatchStockhamLineFft,
  type StockhamLineBindGroup,
  stockhamLayout,
  stockhamNsValues,
  stockhamStageCount,
  stockhamTwiddleLutVec2Count,
  stockhamUniformType,
} from './stockhamRadix2.ts';
import type { LineFftStrategy, LineFftStrategyFactoryContext } from './lineFftStrategy.ts';

/**
 * Pure radix-2 Stockham line FFT (reference implementation). {@link createFft2d} defaults to the faster
 * {@link createStockhamRadix4LineStrategy} instead; pass this factory to opt into radix-2 only.
 */
export function createStockhamRadix2LineStrategy(
  ctx: LineFftStrategyFactoryContext,
): LineFftStrategy {
  const { root, nMax, width: W, height: H, bufA, bufB } = ctx;
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

  function writeStockhamPoolSlot(
    slot: 0 | 1 | 2 | 3,
    n: number,
    lineStride: number,
    numLines: number,
    inverse: boolean,
  ) {
    const pool = stockhamPools[slot];
    const nsList = stockhamNsValues(n);
    const direction = inverse ? 1 : 0;
    for (let i = 0; i < nsList.length; i++) {
      // oxlint-disable-next-line typescript/no-non-null-assertion
      pool.uniforms[i]!.write({ ns: nsList[i]!, n, lineStride, numLines, direction });
    }
  }

  // Slots match {@link createFft2d}: 0=fwd rows, 1=fwd cols, 2=inv rows, 3=inv cols
  writeStockhamPoolSlot(0, W, W, H, false);
  writeStockhamPoolSlot(1, H, H, W, false);
  writeStockhamPoolSlot(2, W, W, H, true);
  writeStockhamPoolSlot(3, H, H, W, true);

  return {
    id: 'stockham-radix2',
    stageCount: stockhamStageCount,
    dispatchLineFft(n, numLines, inputInA, options) {
      const s = options.lineUniformSlot ?? 0;
      const slot = s >= 0 && s <= 3 ? s : 0;
      const pool = stockhamPools[slot];
      return dispatchStockhamLineFft(
        stockhamPipeline,
        pool.uniforms,
        pool.bindSrcA,
        pool.bindSrcB,
        n,
        numLines,
        inputInA,
        options,
      );
    },
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
