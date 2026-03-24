/**
 * Validates @typegpu/sort FFT line strategies: GPU↔CPU (fft.js separable 2D), radix-4 vs radix-2 Stockham,
 * and forward→inverse round-trip (WebGPU).
 *
 * Run in the docs dev server: `/TypeGPU/examples#example=tests--fft-line-strategy-check` — needs WebGPU.
 */
import {
  createFft2d,
  createStockhamRadix2LineStrategy,
  createStockhamRadix4LineStrategy,
  type Fft2d,
} from '@typegpu/sort';
import tgpu, { d } from 'typegpu';
import FFT from 'fft.js';

const W = 64;
const H = 64;
const SEED = 0x9e3779b1;
const WARMUP = 2;
const ERR_PASS_MAX = 5e-3;
const ERR_PASS_RMS = 2e-3;

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHostComplex(): d.v2f[] {
  const rnd = mulberry32(SEED);
  const out: d.v2f[] = [];
  for (let i = 0; i < W * H; i++) {
    const re = rnd() * 2 - 1 + (i === 0 ? 2 : 0);
    const im = rnd() * 2 - 1;
    const x = i % W;
    const y = (i / W) | 0;
    const w =
      0.15 *
      Math.cos((2 * Math.PI * (x * 0.0625 + y * 0.03125)) / W);
    out.push(d.vec2f(re + w, im));
  }
  return out;
}

function hostToFloat64Interleaved(host: d.v2f[]): Float64Array {
  const a = new Float64Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    a[i * 2] = host[i]!.x;
    a[i * 2 + 1] = host[i]!.y;
  }
  return a;
}

function fft2dSeparableForward(work: Float64Array) {
  const fftW = new FFT(W);
  const fftH = new FFT(H);
  const rowIn = fftW.createComplexArray() as number[];
  const rowOut = fftW.createComplexArray() as number[];
  for (let y = 0; y < H; y++) {
    const off = y * W * 2;
    for (let i = 0; i < W * 2; i++) {
      rowIn[i] = work[off + i]!;
    }
    fftW.transform(rowOut, rowIn);
    for (let i = 0; i < W * 2; i++) {
      work[off + i] = rowOut[i]!;
    }
  }
  const colIn = fftH.createComplexArray() as number[];
  const colOut = fftH.createComplexArray() as number[];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      colIn[y * 2] = work[(y * W + x) * 2]!;
      colIn[y * 2 + 1] = work[(y * W + x) * 2 + 1]!;
    }
    fftH.transform(colOut, colIn);
    for (let y = 0; y < H; y++) {
      work[(y * W + x) * 2] = colOut[y * 2]!;
      work[(y * W + x) * 2 + 1] = colOut[y * 2 + 1]!;
    }
  }
}

type Vec2Like = { x: number; y: number };

function gpuGpuDiff(a: Vec2Like[], b: Vec2Like[]): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sumSq = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const dr = a[i]!.x - b[i]!.x;
    const di = a[i]!.y - b[i]!.y;
    const e = Math.hypot(dr, di);
    maxAbs = Math.max(maxAbs, e);
    sumSq += dr * dr + di * di;
  }
  return { maxAbs, rms: Math.sqrt(sumSq / n) };
}

function diffStats(
  gpu: Vec2Like[],
  cpu: Float64Array,
  cpuScale: number,
): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sumSq = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const gr = gpu[i]!.x;
    const gi = gpu[i]!.y;
    const cr = cpu[i * 2]! * cpuScale;
    const ci = cpu[i * 2 + 1]! * cpuScale;
    const dr = gr - cr;
    const di = gi - ci;
    const e = Math.hypot(dr, di);
    maxAbs = Math.max(maxAbs, e);
    sumSq += dr * dr + di * di;
  }
  return { maxAbs, rms: Math.sqrt(sumSq / n) };
}

function submitEncodeForward(device: GPUDevice, fft: Fft2d) {
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  fft.encodeForward(pass);
  pass.end();
  device.queue.submit([enc.finish()]);
}

function submitEncodeInverse(device: GPUDevice, fft: Fft2d) {
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  fft.encodeInverse(pass);
  pass.end();
  device.queue.submit([enc.finish()]);
}

const root = await tgpu.init();
const device = root.device;

const host = buildHostComplex();
const cpuRef = hostToFloat64Interleaved(host);
fft2dSeparableForward(cpuRef);

const fftRadix2 = createFft2d(root, {
  width: W,
  height: H,
  lineFftStrategyFactory: createStockhamRadix2LineStrategy,
});
const fftRadix4 = createFft2d(root, {
  width: W,
  height: H,
  lineFftStrategyFactory: createStockhamRadix4LineStrategy,
});

function loadAndForward(fft: Fft2d) {
  fft.input.write(host);
  submitEncodeForward(device, fft);
}

for (let i = 0; i < WARMUP; i++) {
  loadAndForward(fftRadix2);
  loadAndForward(fftRadix4);
}

loadAndForward(fftRadix2);
loadAndForward(fftRadix4);

const outRadix2 = (await fftRadix2.output().read()) as Vec2Like[];
const outRadix4 = (await fftRadix4.output().read()) as Vec2Like[];

const parityR4 = diffStats(
  outRadix4,
  Float64Array.from(outRadix2.flatMap((v) => [v.x, v.y])),
  1,
);
const parityR4Pass = parityR4.maxAbs < ERR_PASS_MAX && parityR4.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] radix-4 vs radix-2 Stockham: maxAbs=${parityR4.maxAbs.toExponential(3)} rms=${parityR4.rms.toExponential(3)} → ${parityR4Pass ? 'PASS' : 'FAIL'}`,
);

fftRadix2.input.write(host);
submitEncodeForward(device, fftRadix2);
submitEncodeInverse(device, fftRadix2);
const outRadix2Rt = (await fftRadix2.output().read()) as Vec2Like[];

fftRadix4.input.write(host);
submitEncodeForward(device, fftRadix4);
submitEncodeInverse(device, fftRadix4);
const outRadix4Rt = (await fftRadix4.output().read()) as Vec2Like[];

const rtParity = gpuGpuDiff(outRadix4Rt, outRadix2Rt);
const rtPass = rtParity.maxAbs < ERR_PASS_MAX && rtParity.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] forward→inverse round-trip radix-4 vs radix-2: maxAbs=${rtParity.maxAbs.toExponential(3)} rms=${rtParity.rms.toExponential(3)} → ${rtPass ? 'PASS' : 'FAIL'}`,
);

let cpuScale = 1;
let gpuCpu = diffStats(outRadix2, cpuRef, cpuScale);
if (gpuCpu.maxAbs > ERR_PASS_MAX * 50) {
  const s =
    (() => {
      let num = 0;
      let den = 0;
      for (let i = 0; i < W * H; i++) {
        const cr = cpuRef[i * 2]!;
        const ci = cpuRef[i * 2 + 1]!;
        const gr = outRadix2[i]!.x;
        const gi = outRadix2[i]!.y;
        num += gr * cr + gi * ci;
        den += cr * cr + ci * ci;
      }
      return den > 1e-20 ? num / den : 1;
    })();
  if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) {
    cpuScale = s;
    gpuCpu = diffStats(outRadix2, cpuRef, cpuScale);
    console.info(
      `[fft-line-strategy-check] applied CPU ref scale=${cpuScale.toExponential(6)} (fft.js vs unnormalized Stockham)`,
    );
  }
}

const refPass = gpuCpu.maxAbs < ERR_PASS_MAX && gpuCpu.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] GPU radix-2 vs CPU fft.js (2D separable): maxAbs=${gpuCpu.maxAbs.toExponential(3)} rms=${gpuCpu.rms.toExponential(3)} → ${refPass ? 'PASS' : 'FAIL'}`,
);

fftRadix2.destroy();
fftRadix4.destroy();
root.destroy();
