export const DEPTH_KERNEL_WORKGROUP_SIZE = 64;

/** Launch width for the element-per-invocation convolutions */
export const DEPTH_WIDE_WORKGROUP_SIZE = 256;

/** One cooperative scan-projection workgroup owns a direction/position pair */
const SCAN_PROJECT_WORKGROUP_SIZE = 128;

/** Input blocks the specialized 1x1 kernel accumulates in FP16 before flushing to FP32 */
export const POINTWISE_FLUSH_BLOCKS = 8;

/** Pipeline cache key for a shape-specialized kernel; callers prefix the kernel family */
export function shapeKey(shape: object): string {
  return Object.values(shape).join('-');
}

export interface PointwiseTile {
  readonly blockThreads: number;
  readonly blocksPerThread: number;
  readonly pixelThreads: number;
  readonly pixelsPerThread: number;
}

export const POINTWISE_DEFAULT_TILE: PointwiseTile = {
  blockThreads: 4,
  blocksPerThread: 2,
  pixelThreads: 16,
  pixelsPerThread: 4,
};

export interface PointwiseShape {
  readonly inputChannelBlocks: number;
  readonly outputChannelBlocks: number;
  readonly pixelCount: number;
  readonly logicalOutputChannels: number;
}

interface PointwisePlan {
  readonly tile: PointwiseTile;
  readonly workgroups: { readonly x: number; readonly y: number };
}

export function pointwisePlanFor(shape: PointwiseShape): PointwisePlan | undefined {
  const tile = POINTWISE_DEFAULT_TILE;
  const blocksPerGroup = tile.blockThreads * tile.blocksPerThread;
  const pixelsPerGroup = tile.pixelThreads * tile.pixelsPerThread;
  if (shape.outputChannelBlocks < blocksPerGroup || shape.pixelCount < pixelsPerGroup) {
    return undefined;
  }
  return {
    tile,
    workgroups: {
      x: Math.ceil(shape.outputChannelBlocks / blocksPerGroup),
      y: Math.ceil(shape.pixelCount / pixelsPerGroup),
    },
  };
}

export interface WinogradGemmShape {
  readonly tileCount: number;
  readonly inputChannelBlocks: number;
  readonly outputChannelBlocks: number;
}

export interface WinogradGemmTile {
  readonly blockThreads: number;
  readonly blocksPerThread: number;
  readonly tileThreads: number;
  readonly tilesPerThread: number;
}

const WINOGRAD_GEMM_BLOCK_THREADS = 4;
const WINOGRAD_GEMM_TILE_THREADS = 16;

const WINOGRAD_GEMM_ACCUMULATORS = 8;

const WINOGRAD_GEMM_MINIMUM_WORKGROUPS = 64;

/** F(4x4,3x3) emits thirty-six transform coefficients for every 4x4 output tile */
export const WINOGRAD_F4_COEFFICIENTS = 36;

interface WinogradGemmPlan {
  readonly tile: WinogradGemmTile;
  readonly workgroups: { readonly x: number; readonly y: number; readonly z: number };
}

export function winogradGemmPlanFor(shape: WinogradGemmShape): WinogradGemmPlan | undefined {
  const { tileCount, outputChannelBlocks } = shape;
  const tilesPerThread = [4, 2, 1].find((value) => WINOGRAD_GEMM_TILE_THREADS * value <= tileCount);
  if (tilesPerThread === undefined) {
    return undefined;
  }
  const blocksPerThread = [4, 2, 1].find(
    (value) =>
      WINOGRAD_GEMM_BLOCK_THREADS * value <= outputChannelBlocks &&
      value * tilesPerThread <= WINOGRAD_GEMM_ACCUMULATORS,
  );
  if (blocksPerThread === undefined) {
    return undefined;
  }
  const workgroups = {
    x: Math.ceil(outputChannelBlocks / (WINOGRAD_GEMM_BLOCK_THREADS * blocksPerThread)),
    y: Math.ceil(tileCount / (WINOGRAD_GEMM_TILE_THREADS * tilesPerThread)),
    z: WINOGRAD_F4_COEFFICIENTS,
  };
  if (workgroups.x * workgroups.y * workgroups.z < WINOGRAD_GEMM_MINIMUM_WORKGROUPS) {
    return undefined;
  }
  return {
    tile: {
      blockThreads: WINOGRAD_GEMM_BLOCK_THREADS,
      blocksPerThread,
      tileThreads: WINOGRAD_GEMM_TILE_THREADS,
      tilesPerThread,
    },
    workgroups,
  };
}

/** Fixed launch geometry for the staged (non-specialized) Winograd GEMM kernels */
export const WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE = 8;
export const WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE = 16;
export const WINOGRAD_GEMM_F32_TILE_TILE = 16;
export const WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE = 32;
export const WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE = 8;
export const WINOGRAD_GEMM_F16_TILE_TILE = 32;
export const MAX_COMPUTE_WORKGROUPS_PER_DIMENSION = 65_535;

export interface SpatialShape {
  readonly inputChannelBlocks: number;
  readonly outputChannelBlocks: number;
  readonly inputWidth: number;
  readonly inputHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly strideX: number;
  readonly strideY: number;
  readonly padX: number;
  readonly padY: number;
  readonly logicalOutputChannels: number;
}

export interface SpatialTile {
  readonly blockThreads: number;
  readonly blocksPerThread: number;
  readonly columnThreads: number;
  readonly columnsPerThread: number;
}

/** Reconstruction tile: one thread takes a long run of columns and one output block */
const SPATIAL_WIDE_TILE: SpatialTile = {
  blockThreads: 4,
  blocksPerThread: 1,
  columnThreads: 16,
  columnsPerThread: 4,
};

/** Encoder downsampler tile: leans on the channel axis with a short column window */
const SPATIAL_DEEP_TILE: SpatialTile = {
  blockThreads: 8,
  blocksPerThread: 1,
  columnThreads: 8,
  columnsPerThread: 2,
};

/** Above this block count the channel-heavy tile wins */
const SPATIAL_DEEP_MINIMUM_BLOCKS = 16;

/** The deep preset with two blocks per thread, for launches too small to fill the GPU */
const SPATIAL_DEEP_ILP_TILE: SpatialTile = {
  blockThreads: 8,
  blocksPerThread: 2,
  columnThreads: 8,
  columnsPerThread: 2,
};

/** Below this launch size a shape is scheduling-starved and wants ILP over occupancy */
const SPATIAL_MINIMUM_WORKGROUPS = 512;

/** Staged column-window width covering every tap of every output in the tile */
export function spatialColumnCount(tile: SpatialTile, strideX: number): number {
  return (tile.columnsPerThread - 1) * strideX + 3;
}

function spatialWorkgroupCount(shape: SpatialShape, tile: SpatialTile): number {
  return (
    Math.ceil(shape.outputChannelBlocks / (tile.blockThreads * tile.blocksPerThread)) *
    Math.ceil(shape.outputWidth / (tile.columnThreads * tile.columnsPerThread)) *
    shape.outputHeight
  );
}

function spatialTileFor(shape: SpatialShape): SpatialTile | undefined {
  if (shape.outputChannelBlocks >= SPATIAL_DEEP_MINIMUM_BLOCKS) {
    return spatialWorkgroupCount(shape, SPATIAL_DEEP_TILE) < SPATIAL_MINIMUM_WORKGROUPS
      ? SPATIAL_DEEP_ILP_TILE
      : SPATIAL_DEEP_TILE;
  }
  if (
    shape.outputChannelBlocks >=
    SPATIAL_WIDE_TILE.blockThreads * SPATIAL_WIDE_TILE.blocksPerThread
  ) {
    return SPATIAL_WIDE_TILE;
  }
  return undefined;
}

interface SpatialPlan {
  readonly tile: SpatialTile;
  readonly workgroups: { readonly x: number; readonly y: number; readonly z: number };
}

export function spatialPlanFor(shape: SpatialShape): SpatialPlan | undefined {
  const tile = spatialTileFor(shape);
  if (!tile) {
    return undefined;
  }
  const workgroups = {
    x: Math.ceil(shape.outputChannelBlocks / (tile.blockThreads * tile.blocksPerThread)),
    y: Math.ceil(shape.outputWidth / (tile.columnThreads * tile.columnsPerThread)),
    z: shape.outputHeight,
  };
  if (
    workgroups.x > MAX_COMPUTE_WORKGROUPS_PER_DIMENSION ||
    workgroups.y > MAX_COMPUTE_WORKGROUPS_PER_DIMENSION ||
    workgroups.z > MAX_COMPUTE_WORKGROUPS_PER_DIMENSION
  ) {
    return undefined;
  }
  return { tile, workgroups };
}

export interface ElementwiseShape {
  readonly elementCount: number;
  readonly channelBlocks: number;
  readonly logicalChannels: number;
}

export const LAYER_NORM_WORKGROUP_SIZE = 64;

export interface LayerNormShape {
  readonly pixelCount: number;
  readonly channelBlocks: number;
  readonly logicalChannels: number;
}

export function layerNormLanesFor(channelBlocks: number): number {
  let lanes = 1;
  while (lanes < LAYER_NORM_WORKGROUP_SIZE && channelBlocks % (lanes * 2) === 0) {
    lanes *= 2;
  }
  return lanes;
}

export function layerNormPixelsPerGroup(channelBlocks: number): number {
  return LAYER_NORM_WORKGROUP_SIZE / layerNormLanesFor(channelBlocks);
}

export function layerNormWorkgroups(shape: LayerNormShape): number {
  return Math.ceil(shape.pixelCount / layerNormPixelsPerGroup(shape.channelBlocks));
}

/** DepthART's selective state-space recurrence has exactly eight states */
export const SELECTIVE_SCAN_STATE_SIZE = 8;

export interface ScanProjectShape {
  readonly width: number;
  readonly height: number;
  readonly logicalChannels: number;
  readonly channelBlocks: number;
  readonly rank: number;
  readonly positionCount: number;
}

/** Rows the x projection emits: the low-rank delta basis plus B and C */
export function scanProjectOutputBlocks(rank: number): number {
  return Math.ceil((rank + SELECTIVE_SCAN_STATE_SIZE * 2) / 4);
}

export function scanProjectThreadsFor(shape: ScanProjectShape): number {
  const needed = Math.max(scanProjectOutputBlocks(shape.rank), shape.channelBlocks);
  return Math.min(Math.ceil(needed / 32) * 32, SCAN_PROJECT_WORKGROUP_SIZE);
}

/** Upper bound on a scan projection's dt rank; sizes the shared rank buffer */
export const MAX_SELECTIVE_SCAN_RANK = 32;

/** Row-major, column-major, and their full reversals */
export const CROSS_SCAN_DIRECTION_COUNT = 4;
