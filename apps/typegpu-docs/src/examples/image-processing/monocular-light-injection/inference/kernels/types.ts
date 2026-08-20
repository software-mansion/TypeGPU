/** Portable baseline width used by the element-per-invocation kernels */
export const DEPTH_KERNEL_WORKGROUP_SIZE = 64;

/** Launch width for the element-per-invocation convolutions */
export const DEPTH_WIDE_WORKGROUP_SIZE = 256;

/** One cooperative scan-projection workgroup owns a direction/position pair */
const SCAN_PROJECT_WORKGROUP_SIZE = 128;

/** Input blocks the specialized 1x1 kernel accumulates in FP16 before flushing to FP32 */
export const POINTWISE_FLUSH_BLOCKS = 8;

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

export function pointwiseShapeKey(shape: PointwiseShape): string {
  return `${shape.inputChannelBlocks}-${shape.outputChannelBlocks}-${shape.pixelCount}-${shape.logicalOutputChannels}`;
}

function pointwiseWorkgroupsFor(
  shape: PointwiseShape,
  tile: PointwiseTile,
): PointwiseTiledWorkgroups | undefined {
  const blocksPerGroup = tile.blockThreads * tile.blocksPerThread;
  const pixelsPerGroup = tile.pixelThreads * tile.pixelsPerThread;
  if (shape.outputChannelBlocks < blocksPerGroup || shape.pixelCount < pixelsPerGroup) {
    return undefined;
  }
  return {
    x: Math.ceil(shape.outputChannelBlocks / blocksPerGroup),
    y: Math.ceil(shape.pixelCount / pixelsPerGroup),
  };
}

export function pointwiseTileFor(shape: PointwiseShape): PointwiseTile | undefined {
  return pointwiseWorkgroupsFor(shape, POINTWISE_DEFAULT_TILE) ? POINTWISE_DEFAULT_TILE : undefined;
}

export function pointwiseSpecializedWorkgroups(
  shape: PointwiseShape,
): PointwiseTiledWorkgroups | undefined {
  const tile = pointwiseTileFor(shape);
  return tile ? pointwiseWorkgroupsFor(shape, tile) : undefined;
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

/** Below this the reference tiled GEMM is kept instead of the specialized launch */
const WINOGRAD_GEMM_MINIMUM_WORKGROUPS = 64;

/** F(4x4,3x3) emits thirty-six transform coefficients for every 4x4 output tile */
export const WINOGRAD_F4_COEFFICIENTS = 36;

export function winogradGemmTileFor(shape: WinogradGemmShape): WinogradGemmTile | undefined {
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
  const tile = {
    blockThreads: WINOGRAD_GEMM_BLOCK_THREADS,
    blocksPerThread,
    tileThreads: WINOGRAD_GEMM_TILE_THREADS,
    tilesPerThread,
  };
  const workgroups = winogradGemmWorkgroupsFor(shape, tile);
  return workgroups.x * workgroups.y * workgroups.z < WINOGRAD_GEMM_MINIMUM_WORKGROUPS
    ? undefined
    : tile;
}

function winogradGemmWorkgroupsFor(shape: WinogradGemmShape, tile: WinogradGemmTile) {
  return {
    x: Math.ceil(shape.outputChannelBlocks / (tile.blockThreads * tile.blocksPerThread)),
    y: Math.ceil(shape.tileCount / (tile.tileThreads * tile.tilesPerThread)),
    z: WINOGRAD_F4_COEFFICIENTS,
  };
}

export function winogradGemmSpecializedWorkgroups(shape: WinogradGemmShape) {
  const tile = winogradGemmTileFor(shape);
  return tile ? winogradGemmWorkgroupsFor(shape, tile) : undefined;
}

export function winogradGemmShapeKey(shape: WinogradGemmShape, nativeF16: boolean): string {
  return `${shape.tileCount}-${shape.inputChannelBlocks}-${shape.outputChannelBlocks}-${nativeF16 ? 'f16' : 'f32'}`;
}

/** Fixed launch geometry for the staged (non-specialized) Winograd GEMM kernels */
export const WINOGRAD_GEMM_F32_INPUT_BLOCK_TILE = 8;
export const WINOGRAD_GEMM_F32_OUTPUT_BLOCK_TILE = 16;
export const WINOGRAD_GEMM_F32_TILE_TILE = 16;
export const WINOGRAD_GEMM_F16_INPUT_BLOCK_TILE = 32;
export const WINOGRAD_GEMM_F16_OUTPUT_BLOCK_TILE = 8;
export const WINOGRAD_GEMM_F16_TILE_TILE = 32;
export const MAX_COMPUTE_WORKGROUPS_PER_DIMENSION = 65_535;

export interface PointwiseTiledWorkgroups {
  readonly x: number;
  readonly y: number;
}

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
export const SPATIAL_WIDE_TILE: SpatialTile = {
  blockThreads: 4,
  blocksPerThread: 1,
  columnThreads: 16,
  columnsPerThread: 4,
};

/** Encoder downsampler tile: leans on the channel axis with a short column window */
export const SPATIAL_DEEP_TILE: SpatialTile = {
  blockThreads: 8,
  blocksPerThread: 1,
  columnThreads: 8,
  columnsPerThread: 2,
};

/** Above this block count the channel-heavy tile wins */
export const SPATIAL_DEEP_MINIMUM_BLOCKS = 16;

/** The deep preset with two blocks per thread, for launches too small to fill the GPU */
export const SPATIAL_DEEP_ILP_TILE: SpatialTile = {
  blockThreads: 8,
  blocksPerThread: 2,
  columnThreads: 8,
  columnsPerThread: 2,
};

/** Below this launch size a shape is scheduling-starved and wants ILP over occupancy */
export const SPATIAL_MINIMUM_WORKGROUPS = 512;

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

export function spatialTileFor(shape: SpatialShape): SpatialTile | undefined {
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

export function spatialSpecializedWorkgroups(
  shape: SpatialShape,
): { readonly x: number; readonly y: number; readonly z: number } | undefined {
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
  return workgroups;
}

export function spatialShapeKey(shape: SpatialShape): string {
  return [
    shape.inputChannelBlocks,
    shape.outputChannelBlocks,
    shape.inputWidth,
    shape.inputHeight,
    shape.outputWidth,
    shape.outputHeight,
    shape.strideX,
    shape.strideY,
    shape.padX,
    shape.padY,
    shape.logicalOutputChannels,
  ].join('-');
}

export interface ElementwiseShape {
  readonly elementCount: number;
  readonly channelBlocks: number;
  readonly logicalChannels: number;
}

export function elementwiseShapeKey(shape: ElementwiseShape): string {
  return `${shape.elementCount}-${shape.channelBlocks}-${shape.logicalChannels}`;
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

export function layerNormShapeKey(shape: LayerNormShape): string {
  return `${shape.pixelCount}-${shape.channelBlocks}-${shape.logicalChannels}`;
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

export function scanProjectShapeKey(shape: ScanProjectShape): string {
  return [
    shape.width,
    shape.height,
    shape.logicalChannels,
    shape.channelBlocks,
    shape.rank,
    shape.positionCount,
  ].join('-');
}

/** Upper bound on a scan projection's dt rank; sizes the shared rank buffer */
export const MAX_SELECTIVE_SCAN_RANK = 32;

/** Row-major, column-major, and their full reversals */
export const CROSS_SCAN_DIRECTION_COUNT = 4;
