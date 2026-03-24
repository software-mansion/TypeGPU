import tgpu, { d } from 'typegpu';
import type { TgpuBindGroup, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import type { LineFftEncodeOptions } from './lineFftStrategy.ts';
import {
  createStockhamDifStagePipeline,
  createStockhamStagePipeline,
  stockhamUniformType,
  type StockhamLineBindGroup,
} from './stockhamRadix2.ts';
import { decomposeWorkgroups } from './utils.ts';

const WORKGROUP_SIZE = 256;

export const radix4UniformType = d.struct({
  /** Sub-sequence length in Bainville radix-4 kernel (`1, 4, 16, …`). */
  p: d.u32,
  n: d.u32,
  lineStride: d.u32,
  numLines: d.u32,
  /** Start offset into the twiddle LUT for this stage's `p` value: `(p - 1) / 3`. */
  twiddleOffset: d.u32,
});

export const radix4Layout = tgpu.bindGroupLayout({
  uniforms: { uniform: radix4UniformType },
  /** Precomputed twiddle factors; layout matches {@link buildRadix4TwiddleLut}. */
  twiddles: {
    storage: d.arrayOf(d.vec2f),
    access: 'readonly',
  },
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
  const i3 = base + i + T * 3;

  const twOff = radix4Layout.$.uniforms.twiddleOffset;
  const tw1 = radix4Layout.$.twiddles[twOff + k] as d.v2f;
  const tw2 = d.vec2f(tw1.x * tw1.x - tw1.y * tw1.y, d.f32(2) * tw1.x * tw1.y);
  const tw3 = d.vec2f(tw2.x * tw1.x - tw2.y * tw1.y, tw2.x * tw1.y + tw2.y * tw1.x);

  const a0 = radix4Layout.$.src[i0] as d.v2f;
  const a1 = radix4Layout.$.src[i1] as d.v2f;
  const a2 = radix4Layout.$.src[i2] as d.v2f;
  const a3 = radix4Layout.$.src[i3] as d.v2f;

  const u0 = d.vec2f(a0);
  const u1 = d.vec2f(a1.x * tw1.x - a1.y * tw1.y, a1.x * tw1.y + a1.y * tw1.x);
  const u2 = d.vec2f(a2.x * tw2.x - a2.y * tw2.y, a2.x * tw2.y + a2.y * tw2.x);
  const u3 = d.vec2f(a3.x * tw3.x - a3.y * tw3.y, a3.x * tw3.y + a3.y * tw3.x);

  const v0 = d.vec2f(u0.x + u2.x, u0.y + u2.y);
  const v1 = d.vec2f(u0.x - u2.x, u0.y - u2.y);
  const v2 = d.vec2f(u1.x + u3.x, u1.y + u3.y);
  const du1x = u1.x - u3.x;
  const du1y = u1.y - u3.y;
  /** Multiply `(u1−u3)` by `−i` (forward DFT₄ step). */
  const v3 = d.vec2f(du1y, -du1x);

  const y0 = d.vec2f(v0.x + v2.x, v0.y + v2.y);
  const y1 = d.vec2f(v1.x + v3.x, v1.y + v3.y);
  const y2 = d.vec2f(v0.x - v2.x, v0.y - v2.y);
  const y3 = d.vec2f(v1.x - v3.x, v1.y - v3.y);

  const outBase = base + ((i - k) << 2) + k;
  radix4Layout.$.dst[outBase] = d.vec2f(y0);
  radix4Layout.$.dst[outBase + p] = d.vec2f(y1);
  radix4Layout.$.dst[outBase + (p << 1)] = d.vec2f(y2);
  radix4Layout.$.dst[outBase + p + (p << 1)] = d.vec2f(y3);
});

/**
 * Inverse of {@link radix4StageKernel}: read scattered `y`, write linear samples; twiddle `cis(+πk/2p)`.
 * Separate entry point — same uniform layout as forward (no mode flag in the buffer).
 */
export const radix4InverseStageKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  'use gpu';
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
  const i3 = base + i + T * 3;

  const outBase = base + ((i - k) << 2) + k;

  const y0 = radix4Layout.$.src[outBase] as d.v2f;
  const y1 = radix4Layout.$.src[outBase + p] as d.v2f;
  const y2 = radix4Layout.$.src[outBase + (p << 1)] as d.v2f;
  const y3 = radix4Layout.$.src[outBase + p + (p << 1)] as d.v2f;

  const v0 = d.vec2f(y0.x + y2.x, y0.y + y2.y);
  const v2u = d.vec2f(y0.x - y2.x, y0.y - y2.y);
  const v1 = d.vec2f(y1.x + y3.x, y1.y + y3.y);
  const v3m = d.vec2f(y1.x - y3.x, y1.y - y3.y);

  const u0p = d.vec2f(v0.x + v1.x, v0.y + v1.y);
  const u2p = d.vec2f(v0.x - v1.x, v0.y - v1.y);
  const du1 = d.vec2f(-v3m.y, v3m.x);
  const u1p = d.vec2f(v2u.x + du1.x, v2u.y + du1.y);
  const u3p = d.vec2f(v2u.x - du1.x, v2u.y - du1.y);

  const u0 = d.vec2f(u0p);
  const u1 = d.vec2f(u1p);
  const u2 = d.vec2f(u2p);
  const u3 = d.vec2f(u3p);

  const twOff = radix4Layout.$.uniforms.twiddleOffset;
  const twFwd = radix4Layout.$.twiddles[twOff + k] as d.v2f;
  const tw1i = d.vec2f(twFwd.x, -twFwd.y);
  const tw2i = d.vec2f(tw1i.x * tw1i.x - tw1i.y * tw1i.y, d.f32(2) * tw1i.x * tw1i.y);
  const tw3i = d.vec2f(tw2i.x * tw1i.x - tw2i.y * tw1i.y, tw2i.x * tw1i.y + tw2i.y * tw1i.x);

  const b0 = d.vec2f(u0);
  const b1 = d.vec2f(u1.x * tw1i.x - u1.y * tw1i.y, u1.x * tw1i.y + u1.y * tw1i.x);
  const b2 = d.vec2f(u2.x * tw2i.x - u2.y * tw2i.y, u2.x * tw2i.y + u2.y * tw2i.x);
  const b3 = d.vec2f(u3.x * tw3i.x - u3.y * tw3i.y, u3.x * tw3i.y + u3.y * tw3i.x);

  radix4Layout.$.dst[i0] = d.vec2f(b0);
  radix4Layout.$.dst[i1] = d.vec2f(b1);
  radix4Layout.$.dst[i2] = d.vec2f(b2);
  radix4Layout.$.dst[i3] = d.vec2f(b3);
});

export function createRadix4StagePipeline(root: TgpuRoot) {
  return root.createComputePipeline({ compute: radix4StageKernel });
}

export function createRadix4InverseStagePipeline(root: TgpuRoot) {
  return root.createComputePipeline({ compute: radix4InverseStageKernel });
}

/** `floor(log2(n) / 2)` radix-4 passes + one radix-2 Stockham stage when `log₂(n)` is odd. */
export function radix4LineStageCount(n: number): number {
  const k = 31 - Math.clz32(n);
  return Math.floor(k / 2) + (k % 2);
}

/** Max radix-4 butterfly passes for any line length ≤ `nMax` (`floor(log₂(nMax)/2)`). */
export function maxRadix4PassCount(nMax: number): number {
  return Math.floor((31 - Math.clz32(nMax)) / 2);
}

/** Bainville radix-4 stage `p` values in forward order (`1, 4, 16, …`). */
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
 * Number of `vec2f` entries for the radix-4 twiddle LUT up to max line length `nMax`.
 * Layout: for each stage p in `radix4PValues(nMax)`, p entries of `cis(-π·k/(2p))` for k = 0..p-1.
 * Total = sum of p values = (4^r4 - 1)/3 where r4 = `maxRadix4PassCount(nMax)`.
 */
export function radix4TwiddleLutVec2Count(nMax: number): number {
  const ps = radix4PValues(nMax);
  let total = 0;
  for (const p of ps) {
    total += p;
  }
  return total;
}

/**
 * Precomputed twiddle factors `cis(-π·k/(2p))` for all radix-4 stages up to `nMax`.
 * Computed in f64 on CPU for maximum precision.
 */
export function buildRadix4TwiddleLut(nMax: number): [number, number][] {
  const out: [number, number][] = [];
  for (const p of radix4PValues(nMax)) {
    for (let k = 0; k < p; k++) {
      const angle = (-Math.PI * k) / (2 * p);
      out.push([Math.cos(angle), Math.sin(angle)]);
    }
  }
  return out;
}

/** Twiddle LUT offset for a given `p` value: `(p - 1) / 3`. */
function radix4TwiddleOffset(p: number): number {
  return (p - 1) / 3;
}

/**
 * Pre-write all uniform buffers for a radix-4 pool so that {@link dispatchRadix4LineFft}
 * performs zero uniform writes at dispatch time.
 */
export function prepareRadix4Slot(
  pool: Radix4LineUniformPools,
  n: number,
  lineStride: number,
  numLines: number,
  inverse: boolean,
): void {
  const ps = radix4PValues(n);
  for (let s = 0; s < ps.length; s++) {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const p = ps[s]!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    pool.radix4StageUniforms[s]!.write({
      p,
      n,
      lineStride,
      numLines,
      twiddleOffset: radix4TwiddleOffset(p),
    });
  }
  const k = 31 - Math.clz32(n);
  if (k % 2 === 1) {
    pool.stockhamTailUniform.write({
      ns: n >> 1,
      n,
      lineStride,
      numLines,
      direction: inverse ? 1 : 0,
    });
  }
}

/** @internal Unit tests only — not part of the public package API. */
export const _forTesting = {
  radix4PValues,
} as const;

/**
 * Forward: radix-4 stages + optional radix-2 Stockham tail when `log₂(n)` is odd.
 * Inverse: Stockham tail inverse first when `k` is odd, then radix-4 inverse stages in descending `p`.
 */
export type Radix4LineBindGroup = TgpuBindGroup<(typeof radix4Layout)['entries']>;

/** One duplicate uniform/bind-group pool so row vs column line FFT can share one encoder before `submit`. */
export type Radix4LineUniformPools = {
  radix4StageUniforms: ReadonlyArray<TgpuBuffer<typeof radix4UniformType> & UniformFlag>;
  radix4BgSrcA: ReadonlyArray<Radix4LineBindGroup>;
  radix4BgSrcB: ReadonlyArray<Radix4LineBindGroup>;
  stockhamTailUniform: TgpuBuffer<typeof stockhamUniformType> & UniformFlag;
  stockhamTailBgSrcA: StockhamLineBindGroup;
  stockhamTailBgSrcB: StockhamLineBindGroup;
};

export function dispatchRadix4LineFft(
  radix4Pipeline: ReturnType<typeof createRadix4StagePipeline>,
  radix4InversePipeline: ReturnType<typeof createRadix4InverseStagePipeline>,
  stockhamPipeline: ReturnType<typeof createStockhamStagePipeline>,
  stockhamDifPipeline: ReturnType<typeof createStockhamDifStagePipeline>,
  pools: readonly [
    Radix4LineUniformPools,
    Radix4LineUniformPools,
    Radix4LineUniformPools,
    Radix4LineUniformPools,
  ],
  n: number,
  numLines: number,
  inputInA: boolean,
  opts: LineFftEncodeOptions,
): boolean {
  const s = opts.lineUniformSlot ?? 0;
  const slot = s >= 0 && s <= 3 ? s : 0;
  const pool = pools.at(slot);
  if (pool === undefined) {
    throw new Error('@typegpu/sort: invalid lineUniformSlot for radix-4 dispatch');
  }
  const { radix4BgSrcA, radix4BgSrcB, stockhamTailBgSrcA, stockhamTailBgSrcB } = pool;

  const { computePass } = opts;
  const inverse = opts.inverse === true;

  const k = 31 - Math.clz32(n);
  const ps = radix4PValues(n);
  const quarter = n >> 2;
  const totalThreads = numLines * quarter;
  const [wx, wy, wz] = decomposeWorkgroups(Math.ceil(totalThreads / WORKGROUP_SIZE));

  let readA = inputInA;

  if (inverse) {
    if (k % 2 === 1) {
      const tailThreads = numLines * (n >> 1);
      const [twx, twy, twz] = decomposeWorkgroups(Math.ceil(tailThreads / WORKGROUP_SIZE));
      const tailBg = readA ? stockhamTailBgSrcA : stockhamTailBgSrcB;
      stockhamDifPipeline.with(computePass).with(tailBg).dispatchWorkgroups(twx, twy, twz);
      readA = !readA;
    }
    for (let s = ps.length - 1; s >= 0; s--) {
      const bgA = radix4BgSrcA[s];
      const bgB = radix4BgSrcB[s];
      if (bgA === undefined || bgB === undefined) {
        break;
      }
      const bg = readA ? bgA : bgB;
      radix4InversePipeline.with(computePass).with(bg).dispatchWorkgroups(wx, wy, wz);
      readA = !readA;
    }
    return readA;
  }

  for (let s = 0; s < ps.length; s++) {
    const bgA = radix4BgSrcA[s];
    const bgB = radix4BgSrcB[s];
    if (bgA === undefined || bgB === undefined) {
      break;
    }
    const bg = readA ? bgA : bgB;
    radix4Pipeline.with(computePass).with(bg).dispatchWorkgroups(wx, wy, wz);
    readA = !readA;
  }

  if (k % 2 === 1) {
    const tailThreads = numLines * (n >> 1);
    const [twx, twy, twz] = decomposeWorkgroups(Math.ceil(tailThreads / WORKGROUP_SIZE));
    const tailBg = readA ? stockhamTailBgSrcA : stockhamTailBgSrcB;
    stockhamPipeline.with(computePass).with(tailBg).dispatchWorkgroups(twx, twy, twz);
    readA = !readA;
  }

  return readA;
}
