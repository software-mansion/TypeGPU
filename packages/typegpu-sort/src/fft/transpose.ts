import tgpu, { d, std } from 'typegpu';
import type { TgpuBindGroup, TgpuRoot } from 'typegpu';

/** Tile width/height; 16×16 = 256 threads per workgroup. */
const TILE_DIM = 16;
/** +1 column padding avoids many shared-memory bank conflicts on the transpose write. */
const TILE_STRIDE = TILE_DIM + 1;
const TILE_SHARED_LEN = TILE_DIM * TILE_STRIDE;

const MAX_WORKGROUPS_PER_DIMENSION = 65535;

export const transposeUniformType = d.struct({
  srcCols: d.u32,
  srcRows: d.u32,
});

export const transposeLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: transposeUniformType },
  src: {
    storage: d.arrayOf(d.vec2f),
    access: 'readonly',
  },
  dst: {
    storage: d.arrayOf(d.vec2f),
    access: 'mutable',
  },
});

const tile = tgpu.workgroupVar(d.arrayOf(d.vec2f, TILE_SHARED_LEN));
const tileStride = d.u32(TILE_STRIDE);

/**
 * Block transpose: row-major `srcRows × srcCols` → row-major `srcCols × srcRows`.
 * Uses a `TILE_DIM²` tile in workgroup memory so loads and stores hit global memory in coalesced lines.
 */
export const transposeKernel = tgpu.computeFn({
  workgroupSize: [TILE_DIM, TILE_DIM],
  in: {
    lid: d.builtin.localInvocationId,
    wid: d.builtin.workgroupId,
  },
})((input) => {
  const lx = input.lid.x;
  const ly = input.lid.y;
  const srcCols = transposeLayout.$.uniforms.srcCols;
  const srcRows = transposeLayout.$.uniforms.srcRows;

  const j = input.wid.x * d.u32(TILE_DIM) + lx;
  const i = input.wid.y * d.u32(TILE_DIM) + ly;

  if (i < srcRows && j < srcCols) {
    const inIdx = i * srcCols + j;
    tile.$[ly * tileStride + lx] = d.vec2f(transposeLayout.$.src[inIdx] as d.v2f);
  }

  std.workgroupBarrier();

  const outJ = input.wid.x * d.u32(TILE_DIM) + ly;
  const outI = input.wid.y * d.u32(TILE_DIM) + lx;

  if (outJ < srcCols && outI < srcRows) {
    const outIdx = outJ * srcRows + outI;
    const v = tile.$[lx * tileStride + ly] as d.v2f;
    transposeLayout.$.dst[outIdx] = d.vec2f(v);
  }
});

export function createTransposePipeline(root: TgpuRoot) {
  return root.createComputePipeline({ compute: transposeKernel });
}

export function dispatchTranspose(
  pipeline: ReturnType<typeof createTransposePipeline>,
  bindGroup: TgpuBindGroup<(typeof transposeLayout)['entries']>,
  srcCols: number,
  srcRows: number,
  computePass: GPUComputePassEncoder,
): void {
  const numWgX = Math.ceil(srcCols / TILE_DIM);
  const numWgY = Math.ceil(srcRows / TILE_DIM);
  if (numWgX > MAX_WORKGROUPS_PER_DIMENSION || numWgY > MAX_WORKGROUPS_PER_DIMENSION) {
    throw new Error(
      `Transpose grid (${numWgX}×${numWgY}) exceeds max workgroups per dimension (${MAX_WORKGROUPS_PER_DIMENSION})`,
    );
  }
  pipeline.with(computePass).with(bindGroup).dispatchWorkgroups(numWgX, numWgY, 1);
}
