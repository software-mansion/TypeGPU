import { d, std, tgpu } from 'typegpu';
import { winogradGemmLayout } from './layouts.ts';
import {
  WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE,
  WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE,
  WINOGRAD_GEMM_F16_TILE_TILE,
  WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE,
  WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE,
  WINOGRAD_GEMM_F32_TILE_TILE,
  type WinogradGemmShape,
  type WinogradGemmTile,
} from './types.ts';

export const winogradSourceIsF16Slot = tgpu.slot(false);
export const winogradTransformedInputIsF16Slot = tgpu.slot(false);
export const winogradDestinationIsF16Slot = tgpu.slot(false);

const loadF16Input = (pairIndex: number) => {
  'use gpu';
  return std.bitcast(d.vec2u, d.vec4h)(d.vec2u(winogradGemmLayout.$.src[pairIndex]));
};

const loadF16Weight = (pairIndex: number) => {
  'use gpu';
  return std.bitcast(d.vec2u, d.vec4h)(d.vec2u(winogradGemmLayout.$.weights[pairIndex]));
};

const winogradGemmSourceF32At = (logicalIndex: number) => {
  'use gpu';
  const pairBase = logicalIndex * 2;
  const low = d.vec2u(winogradGemmLayout.$.src[pairBase]);
  const high = d.vec2u(winogradGemmLayout.$.src[pairBase + 1]);
  return std.bitcast(d.vec4u, d.vec4f)(d.vec4u(low.x, low.y, high.x, high.y));
};

const winogradGemmSourceF16At = (logicalIndex: number) => {
  'use gpu';
  return d.vec4h(loadF16Input(logicalIndex));
};

const winogradGemmWeightF32At = (logicalIndex: number) => {
  'use gpu';
  const pairBase = winogradGemmLayout.$.params.weightBasePairs + logicalIndex * 2;
  const low = d.vec2u(winogradGemmLayout.$.weights[pairBase]);
  const high = d.vec2u(winogradGemmLayout.$.weights[pairBase + 1]);
  return std.bitcast(d.vec4u, d.vec4f)(d.vec4u(low.x, low.y, high.x, high.y));
};

const winogradGemmWeightF16At = (logicalIndex: number) => {
  'use gpu';
  return d.vec4h(loadF16Weight(winogradGemmLayout.$.params.weightBasePairs + logicalIndex));
};

const f32InputTile = tgpu.workgroupVar(
  d.arrayOf(d.vec4f, WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE * WINOGRAD_GEMM_F32_TILE_TILE),
);
const f32WeightTile = tgpu.workgroupVar(
  d.arrayOf(d.vec4f, WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE * WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE * 4),
);

/** Coefficient-batched FP32 GEMM using the proven O16 x P16 spatial tile */
export const winogradGemmF32Kernel = tgpu.computeFn({
  in: {
    lid: d.builtin.localInvocationId,
    lidx: d.builtin.localInvocationIndex,
    wgid: d.builtin.workgroupId,
  },
  workgroupSize: [WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE, WINOGRAD_GEMM_F32_TILE_TILE],
})(({ lid, lidx, wgid }) => {
  'use gpu';
  const params = winogradGemmLayout.$.params;
  const outputBlock = wgid.x * WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE + lid.x;
  const tile = wgid.y * WINOGRAD_GEMM_F32_TILE_TILE + lid.y;
  const coefficient = wgid.z;
  let accumulator = d.vec4f(0);
  for (
    let inputTileBase = d.u32(0);
    inputTileBase < params.inputChannelBlocks;
    inputTileBase += WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE
  ) {
    const blockCount = std.min(
      d.u32(WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE),
      params.inputChannelBlocks - inputTileBase,
    );
    for (
      let loadIndex = d.u32(lidx);
      loadIndex < blockCount * WINOGRAD_GEMM_F32_TILE_TILE;
      loadIndex += WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE * WINOGRAD_GEMM_F32_TILE_TILE
    ) {
      const inputOffset = std.intdiv(loadIndex, WINOGRAD_GEMM_F32_TILE_TILE);
      const tileLane = loadIndex % WINOGRAD_GEMM_F32_TILE_TILE;
      const sourceTile = wgid.y * WINOGRAD_GEMM_F32_TILE_TILE + tileLane;
      let sourceValue = d.vec4f(0);
      if (sourceTile < params.tileCount) {
        const logicalIndex =
          (coefficient * params.tileCount + sourceTile) * params.inputChannelBlocks +
          inputTileBase +
          inputOffset;
        sourceValue = winogradGemmSourceF32At(logicalIndex);
      }
      f32InputTile.$[loadIndex] = d.vec4f(sourceValue);
    }
    for (
      let loadIndex = d.u32(lidx);
      loadIndex < blockCount * WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE * 4;
      loadIndex += WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE * WINOGRAD_GEMM_F32_TILE_TILE
    ) {
      const perInput = d.u32(WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE * 4);
      const inputOffset = std.intdiv(loadIndex, perInput);
      const within = loadIndex % perInput;
      const tiledOutputBlock = wgid.x * WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE + std.intdiv(within, 4);
      const outputLane = within % 4;
      let weightValue = d.vec4f(0);
      if (tiledOutputBlock < params.outputChannelBlocks) {
        const logicalIndex =
          ((coefficient * params.outputChannelBlocks + tiledOutputBlock) *
            params.inputChannelBlocks +
            inputTileBase +
            inputOffset) *
            4 +
          outputLane;
        weightValue = winogradGemmWeightF32At(logicalIndex);
      }
      f32WeightTile.$[loadIndex] = d.vec4f(weightValue);
    }
    std.workgroupBarrier();
    for (let inputOffset = d.u32(0); inputOffset < blockCount; inputOffset += 1) {
      const value = f32InputTile.$[inputOffset * WINOGRAD_GEMM_F32_TILE_TILE + lid.y];
      const weightBase = inputOffset * WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE * 4 + lid.x * 4;
      accumulator += d.vec4f(
        std.dot(value, f32WeightTile.$[weightBase]),
        std.dot(value, f32WeightTile.$[weightBase + d.u32(1)]),
        std.dot(value, f32WeightTile.$[weightBase + d.u32(2)]),
        std.dot(value, f32WeightTile.$[weightBase + d.u32(3)]),
      );
    }
    std.workgroupBarrier();
  }
  if (tile < params.tileCount && outputBlock < params.outputChannelBlocks) {
    winogradGemmLayout.$.dst[
      (coefficient * params.tileCount + tile) * params.outputChannelBlocks + outputBlock
    ] = d.vec4f(accumulator);
  }
});

const f16InputTile = tgpu.workgroupVar(
  d.arrayOf(d.vec4h, WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE * WINOGRAD_GEMM_F16_TILE_TILE),
);
const f16WeightTile = tgpu.workgroupVar(
  d.arrayOf(d.vec4h, WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE * WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE * 4),
);

/** Native-F16 transformed products with FP32 accumulation across input blocks */
export const winogradGemmF16Kernel = tgpu.computeFn({
  in: {
    lid: d.builtin.localInvocationId,
    lidx: d.builtin.localInvocationIndex,
    wgid: d.builtin.workgroupId,
  },
  workgroupSize: [WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE, WINOGRAD_GEMM_F16_TILE_TILE],
})(({ lid, lidx, wgid }) => {
  'use gpu';
  const params = winogradGemmLayout.$.params;
  const outputBlock = wgid.x * WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE + lid.x;
  const tile = wgid.y * WINOGRAD_GEMM_F16_TILE_TILE + lid.y;
  const coefficient = wgid.z;
  let accumulator = d.vec4f(0);
  for (
    let inputTileBase = d.u32(0);
    inputTileBase < params.inputChannelBlocks;
    inputTileBase += WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE
  ) {
    for (
      let loadIndex = d.u32(lidx);
      loadIndex < WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE * WINOGRAD_GEMM_F16_TILE_TILE;
      loadIndex += WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE * WINOGRAD_GEMM_F16_TILE_TILE
    ) {
      const inputOffset = std.intdiv(loadIndex, WINOGRAD_GEMM_F16_TILE_TILE);
      const tileLane = loadIndex % WINOGRAD_GEMM_F16_TILE_TILE;
      const inputBlock = inputTileBase + inputOffset;
      const sourceTile = wgid.y * WINOGRAD_GEMM_F16_TILE_TILE + tileLane;
      let sourceValue = d.vec4h(0);
      if (inputBlock < params.inputChannelBlocks && sourceTile < params.tileCount) {
        const logicalIndex =
          (coefficient * params.tileCount + sourceTile) * params.inputChannelBlocks + inputBlock;
        sourceValue = d.vec4h(loadF16Input(logicalIndex));
      }
      f16InputTile.$[loadIndex] = d.vec4h(sourceValue);
    }
    for (
      let loadIndex = d.u32(lidx);
      loadIndex < WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE * WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE * 4;
      loadIndex += WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE * WINOGRAD_GEMM_F16_TILE_TILE
    ) {
      const perInput = d.u32(WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE * 4);
      const inputOffset = std.intdiv(loadIndex, perInput);
      const within = loadIndex % perInput;
      const inputBlock = inputTileBase + inputOffset;
      const tiledOutputBlock = wgid.x * WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE + std.intdiv(within, 4);
      const outputLane = within % 4;
      let weightValue = d.vec4h(0);
      if (inputBlock < params.inputChannelBlocks && tiledOutputBlock < params.outputChannelBlocks) {
        const logicalIndex =
          ((coefficient * params.outputChannelBlocks + tiledOutputBlock) *
            params.inputChannelBlocks +
            inputBlock) *
            4 +
          outputLane;
        weightValue = d.vec4h(loadF16Weight(params.weightBasePairs + logicalIndex));
      }
      f16WeightTile.$[loadIndex] = d.vec4h(weightValue);
    }
    std.workgroupBarrier();
    for (
      let inputOffset = d.u32(0);
      inputOffset < WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE;
      inputOffset += 1
    ) {
      if (inputTileBase + inputOffset < params.inputChannelBlocks) {
        const value = f16InputTile.$[inputOffset * WINOGRAD_GEMM_F16_TILE_TILE + lid.y];
        const weightBase = inputOffset * WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE * 4 + lid.x * 4;
        accumulator += d.vec4f(
          d.f32(std.dot(value, f16WeightTile.$[weightBase])),
          d.f32(std.dot(value, f16WeightTile.$[weightBase + d.u32(1)])),
          d.f32(std.dot(value, f16WeightTile.$[weightBase + d.u32(2)])),
          d.f32(std.dot(value, f16WeightTile.$[weightBase + d.u32(3)])),
        );
      }
    }
    std.workgroupBarrier();
  }
  if (tile < params.tileCount && outputBlock < params.outputChannelBlocks) {
    winogradGemmLayout.$.dst[
      (coefficient * params.tileCount + tile) * params.outputChannelBlocks + outputBlock
    ] = d.vec4f(accumulator);
  }
});

/** Four products against one O4/I4 weight tile, accumulated in FP32 either way */
const winogradGemmProducts = (
  value: d.v4h | d.v4f,
  weight0: d.v4h | d.v4f,
  weight1: d.v4h | d.v4f,
  weight2: d.v4h | d.v4f,
  weight3: d.v4h | d.v4f,
) => {
  'use gpu';
  return d.vec4f(
    d.f32(std.dot(value, weight0)),
    d.f32(std.dot(value, weight1)),
    d.f32(std.dot(value, weight2)),
    d.f32(std.dot(value, weight3)),
  );
};

/** Shape-specialized Winograd GEMM */
export const createSpecializedWinogradGemmKernel = (
  shape: WinogradGemmShape,
  tile: WinogradGemmTile,
  nativeF16: boolean,
) => {
  const { tileCount, inputChannelBlocks, outputChannelBlocks } = shape;
  const { blockThreads, blocksPerThread, tileThreads, tilesPerThread } = tile;
  const blocksPerGroup = blockThreads * blocksPerThread;
  const tilesPerGroup = tileThreads * tilesPerThread;
  const guardTiles = tileCount % tilesPerGroup !== 0;
  const guardBlocks = outputChannelBlocks % blocksPerGroup !== 0;
  const sourceAt = nativeF16 ? winogradGemmSourceF16At : winogradGemmSourceF32At;
  const weightAt = nativeF16 ? winogradGemmWeightF16At : winogradGemmWeightF32At;

  return tgpu.computeFn({
    in: { lid: d.builtin.localInvocationId, wgid: d.builtin.workgroupId },
    workgroupSize: [blockThreads, tileThreads],
  })(({ lid, wgid }) => {
    'use gpu';
    const firstBlock = wgid.x * blocksPerGroup + lid.x;
    const firstTile = wgid.y * tilesPerGroup + lid.y;
    const coefficientTileBase = wgid.z * tileCount;
    const coefficientBlockBase = wgid.z * outputChannelBlocks;
    const accumulators = d.arrayOf(d.vec4f, blocksPerThread * tilesPerThread)();

    for (let inputBlock = d.u32(0); inputBlock < inputChannelBlocks; inputBlock += 1) {
      const inputs = d.arrayOf(nativeF16 ? d.vec4h : d.vec4f, tilesPerThread)();
      for (const tileLane of tgpu.unroll(std.range(tilesPerThread))) {
        const sourceTile = firstTile + tileLane * tileThreads;
        inputs[tileLane] = sourceAt(
          (coefficientTileBase + sourceTile) * inputChannelBlocks + inputBlock,
        );
      }

      for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
        const outputBlock = firstBlock + blockLane * blockThreads;
        const tileBase =
          ((coefficientBlockBase + outputBlock) * inputChannelBlocks + inputBlock) * 4;
        const weight0 = weightAt(tileBase);
        const weight1 = weightAt(tileBase + 1);
        const weight2 = weightAt(tileBase + 2);
        const weight3 = weightAt(tileBase + 3);
        for (const tileLane of tgpu.unroll(std.range(tilesPerThread))) {
          const slot = blockLane * tilesPerThread + tileLane;
          accumulators[slot] =
            accumulators[slot] +
            winogradGemmProducts(inputs[tileLane], weight0, weight1, weight2, weight3);
        }
      }
    }

    for (const blockLane of tgpu.unroll(std.range(blocksPerThread))) {
      const outputBlock = firstBlock + blockLane * blockThreads;
      if (!guardBlocks || outputBlock < outputChannelBlocks) {
        for (const tileLane of tgpu.unroll(std.range(tilesPerThread))) {
          const outputTile = firstTile + tileLane * tileThreads;
          if (!guardTiles || outputTile < tileCount) {
            winogradGemmLayout.$.dst[
              (coefficientTileBase + outputTile) * outputChannelBlocks + outputBlock
            ] = d.vec4f(accumulators[blockLane * tilesPerThread + tileLane]);
          }
        }
      }
    }
  });
};
