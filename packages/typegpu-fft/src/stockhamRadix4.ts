import tgpu, { d, std } from 'typegpu';
import type { TgpuBindGroup, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import {
  createStockhamStagePipeline,
  dispatchStockhamLineFft,
  dispatchStockhamLineFftStages,
  stockhamLayout,
  stockhamUniformType,
} from './stockham.ts';
import { decomposeWorkgroups } from './utils.ts';

const WORKGROUP_SIZE = 256;

export const radix4UniformType = d.struct({
  /** Sub-sequence length in Bainville radix-4 kernel (`1, 4, 16, …`). */
  p: d.u32,
  n: d.u32,
  lineStride: d.u32,
  numLines: d.u32,
  /** `0` = forward; `1` = inverse (conjugate twiddles). */
  direction: d.u32,
});

export const radix4Layout = tgpu.bindGroupLayout({
  uniforms: { uniform: radix4UniformType },
  src: {
    storage: d.arrayOf(d.vec2f),
    access: 'readonly',
  },
  dst: {
    storage: d.arrayOf(d.vec2f),
    access: 'mutable',
  },
});

/**
 * One radix-4 stage (Eric Bainville / OpenCL FFT notes), out-of-place, same ping-pong pattern as Stockham.
 */
export const radix4StageKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const wg = d.u32(WORKGROUP_SIZE);
  const spanX = input.numWorkgroups.x * wg;
  const spanY = input.numWorkgroups.y * spanX;

  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const n = radix4Layout.$.uniforms.n;
  const quarter = n >> 2;
  const numLines = radix4Layout.$.uniforms.numLines;
  const total = numLines * quarter;

  if (tid >= total) {
    return;
  }

  const line = d.u32(tid / quarter);
  const i = tid - line * quarter;

  const p = radix4Layout.$.uniforms.p;
  const k = i & (p - d.u32(1));
  const T = quarter;

  const lineStride = radix4Layout.$.uniforms.lineStride;
  const base = line * lineStride;

  const i0 = base + i;
  const i1 = base + i + T;
  const i2 = base + i + (T << 1);
  const i3 = base + i + (T * 3);

  const inv = radix4Layout.$.uniforms.direction !== d.u32(0);
  const pi = d.f32(3.141592653589793);
  let ang = (-pi * d.f32(k)) / (d.f32(2) * d.f32(p));
  ang = std.select(ang, -ang, inv);
  const c1 = std.cos(ang);
  const sn1 = std.sin(ang);
  const tw1 = d.vec2f(c1, sn1);
  const tw2 = d.vec2f(c1 * c1 - sn1 * sn1, d.f32(2) * c1 * sn1);
  const tw3 = d.vec2f(
    tw2.x * c1 - tw2.y * sn1,
    tw2.x * sn1 + tw2.y * c1,
  );

  const a0 = radix4Layout.$.src[i0] as d.v2f;
  const a1 = radix4Layout.$.src[i1] as d.v2f;
  const a2 = radix4Layout.$.src[i2] as d.v2f;
  const a3 = radix4Layout.$.src[i3] as d.v2f;

  const u0 = d.vec2f(a0.x, a0.y);
  const u1 = d.vec2f(
    a1.x * tw1.x - a1.y * tw1.y,
    a1.x * tw1.y + a1.y * tw1.x,
  );
  const u2 = d.vec2f(
    a2.x * tw2.x - a2.y * tw2.y,
    a2.x * tw2.y + a2.y * tw2.x,
  );
  const u3 = d.vec2f(
    a3.x * tw3.x - a3.y * tw3.y,
    a3.x * tw3.y + a3.y * tw3.x,
  );

  const v0 = d.vec2f(u0.x + u2.x, u0.y + u2.y);
  const v1 = d.vec2f(u0.x - u2.x, u0.y - u2.y);
  const v2 = d.vec2f(u1.x + u3.x, u1.y + u3.y);
  const du1x = u1.x - u3.x;
  const du1y = u1.y - u3.y;
  /** `±i` rotation in the DFT₄ (forward vs inverse). */
  const v3 = std.select(
    d.vec2f(du1y, -du1x),
    d.vec2f(-du1y, du1x),
    inv,
  );

  const y0 = d.vec2f(v0.x + v2.x, v0.y + v2.y);
  const y1 = d.vec2f(v1.x + v3.x, v1.y + v3.y);
  const y2 = d.vec2f(v0.x - v2.x, v0.y - v2.y);
  const y3 = d.vec2f(v1.x - v3.x, v1.y - v3.y);

  const outBase = base + ((i - k) << 2) + k;
  radix4Layout.$.dst[outBase] = d.vec2f(y0.x, y0.y);
  radix4Layout.$.dst[outBase + p] = d.vec2f(y1.x, y1.y);
  radix4Layout.$.dst[outBase + (p << 1)] = d.vec2f(y2.x, y2.y);
  radix4Layout.$.dst[outBase + p + (p << 1)] = d.vec2f(y3.x, y3.y);
});

export function createRadix4StagePipeline(root: TgpuRoot) {
  return root.createComputePipeline({ compute: radix4StageKernel });
}

/** `floor(log2(n) / 2)` radix-4 passes + one radix-2 Stockham stage when `log2(n)` is odd. */
export function radix4LineStageCount(n: number): number {
  const k = 31 - Math.clz32(n);
  return Math.floor(k / 2) + (k % 2);
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

export function dispatchRadix4LineFft(
  radix4Pipeline: ReturnType<typeof createRadix4StagePipeline>,
  radix4Uniform: TgpuBuffer<typeof radix4UniformType> & UniformFlag,
  stockhamPipeline: ReturnType<typeof createStockhamStagePipeline>,
  stockhamUniform: TgpuBuffer<typeof stockhamUniformType> & UniformFlag,
  n: number,
  lineStride: number,
  numLines: number,
  inputInA: boolean,
  radix4BgSrcA: TgpuBindGroup<(typeof radix4Layout)['entries']>,
  radix4BgSrcB: TgpuBindGroup<(typeof radix4Layout)['entries']>,
  stockhamBgSrcA: TgpuBindGroup<(typeof stockhamLayout)['entries']>,
  stockhamBgSrcB: TgpuBindGroup<(typeof stockhamLayout)['entries']>,
  opts?: { computePass?: GPUComputePassEncoder; inverse?: boolean },
): boolean {
  const computePass = opts?.computePass;
  const inverse = opts?.inverse === true;

  /**
   * Forward uses fewer global passes than full Stockham; numerically it matches the same line DFT.
   * The bespoke radix-4 inverse path was incorrect for 2D + `skipFinalTranspose` camera flows — use the
   * proven full Stockham inverse (same linear map as {@link dispatchStockhamLineFft} forward).
   */
  if (inverse) {
    return dispatchStockhamLineFft(
      stockhamPipeline,
      stockhamUniform,
      n,
      lineStride,
      numLines,
      inputInA,
      stockhamBgSrcA,
      stockhamBgSrcB,
      opts,
    );
  }

  const k = 31 - Math.clz32(n);
  const ps = radix4PValues(n);
  const quarter = n >> 2;
  const totalThreads = numLines * quarter;
  const [wx, wy, wz] = decomposeWorkgroups(Math.ceil(totalThreads / WORKGROUP_SIZE));

  let readA = inputInA;
  const direction = 0;

  const runRadix4Stages = (stages: number[]) => {
    for (const p of stages) {
      radix4Uniform.write({ p, n, lineStride, numLines, direction });
      const bg = readA ? radix4BgSrcA : radix4BgSrcB;
      const scoped = computePass ? radix4Pipeline.with(computePass).with(bg) : radix4Pipeline.with(bg);
      scoped.dispatchWorkgroups(wx, wy, wz);
      readA = !readA;
    }
  };

  runRadix4Stages(ps);
  if (k % 2 === 1) {
    readA = dispatchStockhamLineFftStages(
      stockhamPipeline,
      stockhamUniform,
      n,
      lineStride,
      numLines,
      readA,
      stockhamBgSrcA,
      stockhamBgSrcB,
      [n >> 1],
      opts,
    );
  }

  return readA;
}
