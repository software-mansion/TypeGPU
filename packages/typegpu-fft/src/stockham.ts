import tgpu, { d, std } from 'typegpu';
import type { TgpuBindGroup, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu';
import { decomposeWorkgroups } from './utils.ts';

const WORKGROUP_SIZE = 256;

export const stockhamUniformType = d.struct({
  ns: d.u32,
  n: d.u32,
  lineStride: d.u32,
  numLines: d.u32,
  /** `0` = forward DFT twiddles `cis(−π·k/ns)`; `1` = inverse (multiply by `conj(twiddle)` = `cis(+π·k/ns)`). */
  direction: d.u32,
});

export const stockhamLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: stockhamUniformType },
  /** Precomputed `vec2(cos θ, sin θ)` for θ = −π·k/ns; layout matches {@link buildStockhamTwiddleLut}. */
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
 * One Stockham radix-2 stage (Futhark-style indices), out-of-place.
 * @see https://github.com/diku-dk/fft/blob/master/lib/github.com/diku-dk/fft/stockham-radix-2.fut
 */
export const stockhamStageKernel = tgpu.computeFn({
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

  const n = stockhamLayout.$.uniforms.n;
  const half = n >> 1;
  const numLines = stockhamLayout.$.uniforms.numLines;
  const total = numLines * half;

  if (tid >= total) {
    return;
  }

  const j = tid % half;
  // `/` is typed as f32 (JS compat); cast back for u32 index math.
  const line = d.u32(tid / half);
  const lineStride = stockhamLayout.$.uniforms.lineStride;
  const base = line * lineStride;

  const i0 = base + j;
  const i1 = base + j + half;

  const ns = stockhamLayout.$.uniforms.ns;
  const k = j % ns;
  const twIdx = ns - d.u32(1) + k;
  const w = stockhamLayout.$.twiddles[twIdx] as d.v2f;
  const inv = stockhamLayout.$.uniforms.direction !== d.u32(0);
  /** LUT stores `cis(−θ)`; inverse DFT uses `cis(+θ) = conj(cis(−θ))` → negate imaginary part. */
  const wy = std.select(w.y, -w.y, inv);

  const u = stockhamLayout.$.src[i0] as d.v2f;
  const t = stockhamLayout.$.src[i1] as d.v2f;
  const vx = t.x * w.x - t.y * wy;
  const vy = t.x * wy + t.y * w.x;
  const tv = d.vec2f(vx, vy);

  const v0 = d.vec2f(u.x + tv.x, u.y + tv.y);
  const v1 = d.vec2f(u.x - tv.x, u.y - tv.y);

  const jDivNs = d.u32(j / ns);
  const idxD = jDivNs * (ns << 1) + (j % ns);
  stockhamLayout.$.dst[base + idxD] = d.vec2f(v0.x, v0.y);
  stockhamLayout.$.dst[base + idxD + ns] = d.vec2f(v1.x, v1.y);
});

export function createStockhamStagePipeline(root: TgpuRoot) {
  return root.createComputePipeline({ compute: stockhamStageKernel });
}

export function stockhamNsValues(n: number): number[] {
  const bits = 31 - Math.clz32(n);
  return Array.from({ length: bits }, (_, i) => 1 << i);
}

/** Number of radix-2 Stockham stages for line length `n` (power of two). */
export function stockhamStageCount(n: number): number {
  return stockhamNsValues(n).length;
}

/** Number of `vec2f` entries for {@link buildStockhamTwiddleLut} at max line length `n` (power of two). */
export function stockhamTwiddleLutVec2Count(n: number): number {
  return n - 1;
}

/**
 * Twiddle factors for every Stockham stage up to line length `nMax`: for each `ns` in
 * {@link stockhamNsValues}(nMax), entries k = 0..ns−1 store cis(−π·k/ns).
 */
export function buildStockhamTwiddleLut(nMax: number): [number, number][] {
  const out: [number, number][] = [];
  for (const ns of stockhamNsValues(nMax)) {
    for (let k = 0; k < ns; k++) {
      const angle = (-Math.PI * k) / ns;
      out.push([Math.cos(angle), Math.sin(angle)]);
    }
  }
  return out;
}

export function dispatchStockhamLineFft(
  pipeline: ReturnType<typeof createStockhamStagePipeline>,
  uniformBuffer: TgpuBuffer<typeof stockhamUniformType> & UniformFlag,
  n: number,
  lineStride: number,
  numLines: number,
  inputInA: boolean,
  /** `src = bufA → dst = bufB` */
  bindGroupSrcA: TgpuBindGroup<(typeof stockhamLayout)['entries']>,
  /** `src = bufB → dst = bufA` */
  bindGroupSrcB: TgpuBindGroup<(typeof stockhamLayout)['entries']>,
  opts?: { computePass?: GPUComputePassEncoder; inverse?: boolean },
): boolean {
  const computePass = opts?.computePass;
  const inverse = opts?.inverse === true;
  const nsList = stockhamNsValues(n);
  const totalThreads = numLines * (n >> 1);
  const [wx, wy, wz] = decomposeWorkgroups(Math.ceil(totalThreads / WORKGROUP_SIZE));

  let readA = inputInA;
  const direction = inverse ? 1 : 0;

  for (const ns of nsList) {
    uniformBuffer.write({ ns, n, lineStride, numLines, direction });
    const bg = readA ? bindGroupSrcA : bindGroupSrcB;
    const scoped = computePass ? pipeline.with(computePass).with(bg) : pipeline.with(bg);
    scoped.dispatchWorkgroups(wx, wy, wz);
    readA = !readA;
  }

  // `readA` after the last stage: result lives in bufA iff true, else bufB.
  return readA;
}
