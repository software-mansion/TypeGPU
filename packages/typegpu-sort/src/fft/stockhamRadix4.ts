import tgpu, { d } from 'typegpu';
import type { TgpuBindGroup, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import { complexCmulDs, splitComplexFromVec2 } from './complex.ts';
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
  /** Start offset into the twiddle LUT for this stage's `p` value (`3` vec2 per `k`); equals `p − 1`. */
  twiddleOffset: d.u32,
  /**
   * Multiply every written output sample by this (orthonormal 2D: `1/sqrt(n)` on both last forward
   * and first inverse stage). Use `1` for no extra scaling.
   */
  outputScale: d.f32,
});

export const radix4Layout = tgpu.bindGroupLayout({
  uniforms: { uniform: radix4UniformType },
  /** High parts of precomputed twiddles; layout matches {@link buildRadix4TwiddleLutHiLo}. */
  twiddles: {
    storage: d.arrayOf(d.vec2f),
    access: 'readonly',
  },
  twiddlesLo: {
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

  const twOff = radix4Layout.$.uniforms.twiddleOffset;
  const tbase = twOff + d.u32(3) * k;
  const tw1_hi = radix4Layout.$.twiddles[tbase] as d.v2f;
  const tw1_lo = radix4Layout.$.twiddlesLo[tbase] as d.v2f;
  const tw2_hi = radix4Layout.$.twiddles[tbase + d.u32(1)] as d.v2f;
  const tw2_lo = radix4Layout.$.twiddlesLo[tbase + d.u32(1)] as d.v2f;
  const tw3_hi = radix4Layout.$.twiddles[tbase + d.u32(2)] as d.v2f;
  const tw3_lo = radix4Layout.$.twiddlesLo[tbase + d.u32(2)] as d.v2f;

  const a0 = radix4Layout.$.src[i0] as d.v2f;
  const a1 = radix4Layout.$.src[i1] as d.v2f;
  const a2 = radix4Layout.$.src[i2] as d.v2f;
  const a3 = radix4Layout.$.src[i3] as d.v2f;

  const u0 = d.vec2f(a0);
  const u1 = complexCmulDs(a1, tw1_hi, tw1_lo);
  const u2 = complexCmulDs(a2, tw2_hi, tw2_lo);
  const u3 = complexCmulDs(a3, tw3_hi, tw3_lo);

  const v0 = u0 + u2;
  const v1 = u0 - u2;
  const v2 = u1 + u3;
  const du1 = u1 - u3;
  /** Multiply `(u1−u3)` by `−i` (forward DFT₄ step). */
  const v3 = d.vec2f(du1.y, -du1.x);

  const y0 = v0 + v2;
  const y1 = v1 + v3;
  const y2 = v0 - v2;
  const y3 = v1 - v3;

  const s = radix4Layout.$.uniforms.outputScale;

  const outBase = base + ((i - k) << 2) + k;
  radix4Layout.$.dst[outBase] = y0 * s;
  radix4Layout.$.dst[outBase + p] = y1 * s;
  radix4Layout.$.dst[outBase + (p << 1)] = y2 * s;
  radix4Layout.$.dst[outBase + p + (p << 1)] = y3 * s;
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

  const v0 = y0 + y2;
  const v2u = y0 - y2;
  const v1 = y1 + y3;
  const v3m = y1 - y3;

  const u0p = v0 + v1;
  const u2p = v0 - v1;
  const du1 = d.vec2f(-v3m.y, v3m.x);
  const u1p = v2u + du1;
  const u3p = v2u - du1;

  const twOff = radix4Layout.$.uniforms.twiddleOffset;
  const tbase = twOff + d.u32(3) * k;
  const tw1_hi = radix4Layout.$.twiddles[tbase] as d.v2f;
  const tw1_lo = radix4Layout.$.twiddlesLo[tbase] as d.v2f;
  const tw2_hi = radix4Layout.$.twiddles[tbase + d.u32(1)] as d.v2f;
  const tw2_lo = radix4Layout.$.twiddlesLo[tbase + d.u32(1)] as d.v2f;
  const tw3_hi = radix4Layout.$.twiddles[tbase + d.u32(2)] as d.v2f;
  const tw3_lo = radix4Layout.$.twiddlesLo[tbase + d.u32(2)] as d.v2f;

  /** `conj(cis(−mθ))` from forward double-single parts. */
  const conjMask = d.vec2f(1, -1);
  const c1 = (tw1_hi + tw1_lo) * conjMask;
  const c2 = (tw2_hi + tw2_lo) * conjMask;
  const c3 = (tw3_hi + tw3_lo) * conjMask;
  const sp1 = splitComplexFromVec2(c1);
  const sp2 = splitComplexFromVec2(c2);
  const sp3 = splitComplexFromVec2(c3);

  const b0 = u0p;
  const b1 = complexCmulDs(u1p, sp1.xy, sp1.zw);
  const b2 = complexCmulDs(u2p, sp2.xy, sp2.zw);
  const b3 = complexCmulDs(u3p, sp3.xy, sp3.zw);

  const s = radix4Layout.$.uniforms.outputScale;

  radix4Layout.$.dst[i0] = b0 * s;
  radix4Layout.$.dst[i1] = b1 * s;
  radix4Layout.$.dst[i2] = b2 * s;
  radix4Layout.$.dst[i3] = b3 * s;
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
export function radix4PValues(n: number): number[] {
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
 * Number of `vec2f` entries per radix-4 twiddle buffer (hi or lo) up to max line length `nMax`.
 * Three entries per `(p, k)` for `cis(θ)`, `cis(2θ)`, `cis(3θ)` with θ = −π·k/(2p).
 */
export function radix4TwiddleLutVec2Count(nMax: number): number {
  const ps = radix4PValues(nMax);
  let total = 0;
  for (const p of ps) {
    total += 3 * p;
  }
  return total;
}

/**
 * Precomputed twiddle high/low parts for all radix-4 stages up to `nMax` (f64 angles, f32 hi/lo).
 */
export function buildRadix4TwiddleLutHiLo(nMax: number): {
  hi: [number, number][];
  lo: [number, number][];
} {
  const hi: [number, number][] = [];
  const lo: [number, number][] = [];
  for (const p of radix4PValues(nMax)) {
    for (let k = 0; k < p; k++) {
      const theta = (-Math.PI * k) / (2 * p);
      for (const m of [1, 2, 3] as const) {
        const angle = theta * m;
        const re = Math.cos(angle);
        const im = Math.sin(angle);
        const hre = Math.fround(re);
        const him = Math.fround(im);
        hi.push([hre, him]);
        lo.push([Math.fround(re - hre), Math.fround(im - him)]);
      }
    }
  }
  return { hi, lo };
}

/** Twiddle LUT offset for a given `p` value (3 vec2 per k): `p − 1`. */
export function radix4TwiddleOffset(p: number): number {
  return p - 1;
}

function writeRadix4PoolUniformDefaults(
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
      outputScale: 1.0,
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
      outputScale: 1.0,
    });
  }
}

function patchLastForwardOrthonormalScale(
  pool: Radix4LineUniformPools,
  n: number,
  lineStride: number,
  numLines: number,
  scale: number,
): void {
  const ps = radix4PValues(n);
  const k = 31 - Math.clz32(n);
  if (k % 2 === 1) {
    pool.stockhamTailUniform.write({
      ns: n >> 1,
      n,
      lineStride,
      numLines,
      direction: 0,
      outputScale: scale,
    });
  } else if (ps.length > 0) {
    const s = ps.length - 1;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const p = ps[s]!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    pool.radix4StageUniforms[s]!.write({
      p,
      n,
      lineStride,
      numLines,
      twiddleOffset: radix4TwiddleOffset(p),
      outputScale: scale,
    });
  }
}

function patchFirstInverseOrthonormalScale(
  pool: Radix4LineUniformPools,
  n: number,
  lineStride: number,
  numLines: number,
  scale: number,
): void {
  const ps = radix4PValues(n);
  const k = 31 - Math.clz32(n);
  if (k % 2 === 1) {
    pool.stockhamTailUniform.write({
      ns: n >> 1,
      n,
      lineStride,
      numLines,
      direction: 1,
      outputScale: scale,
    });
  } else if (ps.length > 0) {
    const s = ps.length - 1;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const p = ps[s]!;
    // oxlint-disable-next-line typescript/no-non-null-assertion
    pool.radix4StageUniforms[s]!.write({
      p,
      n,
      lineStride,
      numLines,
      twiddleOffset: radix4TwiddleOffset(p),
      outputScale: scale,
    });
  }
}

/**
 * Pre-write all uniform buffers for a radix-4 pool so that {@link dispatchRadix4LineFft}
 * can avoid redundant writes when no orthonormal scaling is requested.
 */
export function prepareRadix4Slot(
  pool: Radix4LineUniformPools,
  n: number,
  lineStride: number,
  numLines: number,
  inverse: boolean,
): void {
  writeRadix4PoolUniformDefaults(pool, n, lineStride, numLines, inverse);
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

  const lineStride = n;
  writeRadix4PoolUniformDefaults(pool, n, lineStride, numLines, inverse);
  if (!inverse && opts.lastPassOrthonormalScale !== undefined) {
    patchLastForwardOrthonormalScale(pool, n, lineStride, numLines, opts.lastPassOrthonormalScale);
  }
  if (inverse && opts.firstPassOrthonormalScale !== undefined) {
    patchFirstInverseOrthonormalScale(
      pool,
      n,
      lineStride,
      numLines,
      opts.firstPassOrthonormalScale,
    );
  }

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
