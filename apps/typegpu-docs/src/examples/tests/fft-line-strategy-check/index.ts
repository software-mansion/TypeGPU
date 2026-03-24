/**
 * Validates @typegpu/sort FFT line strategies against CPU references: 1D naive DFT and fft.js row FFT,
 * 2D separable spectrum (fft.js), reconstructed input after fft.js forward+inverse, plus radix-4 vs radix-2 cross-checks.
 *
 * Run in the docs dev server: `/TypeGPU/examples#example=tests--fft-line-strategy-check` — needs WebGPU.
 */
import {
  createFft2d,
  createStockhamRadix2LineStrategy,
  createStockhamRadix4LineStrategy,
  type Fft2d,
  type LineFftStrategy,
} from '@typegpu/sort';
import tgpu, { d } from 'typegpu';
import FFT from 'fft.js';

const W = 64;
const H = 64;
const SEED = 0x9e3779b1;
const WARMUP = 2;
const ERR_PASS_MAX = 5e-3;
const ERR_PASS_RMS = 2e-3;

const ansi = { green: '\x1b[32m', red: '\x1b[31m', reset: '\x1b[0m' } as const;

function passFailTag(ok: boolean): string {
  return ok ? `${ansi.green}PASS${ansi.reset}` : `${ansi.red}FAIL${ansi.reset}`;
}

/** Bump to confirm the docs example bundle reloaded (see console). */
const RUN_STAMP = 5;
console.info(`[fft-line-strategy-check] RUN_STAMP=${RUN_STAMP}`);

/** Unnormalized forward DFT: X[k] = Σ_j x[j]·exp(-2πi·k·j/n). Interleaved re, im. */
function naiveDft1dForward(input: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n * 2);
  const twopi = 2 * Math.PI;
  for (let k = 0; k < n; k++) {
    let re = 0;
    let im = 0;
    for (let j = 0; j < n; j++) {
      const jre = input[j * 2];
      const jim = input[j * 2 + 1];
      const ang = (-twopi * k * j) / n;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      re += jre * c - jim * s;
      im += jre * s + jim * c;
    }
    out[k * 2] = re;
    out[k * 2 + 1] = im;
  }
  return out;
}

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
    const w = 0.15 * Math.cos((2 * Math.PI * (x * 0.0625 + y * 0.03125)) / W);
    out.push(d.vec2f(re + w, im));
  }
  return out;
}

function hostToFloat64Interleaved(host: d.v2f[]): Float64Array {
  const a = new Float64Array(W * H * 2);
  for (let i = 0; i < W * H; i++) {
    a[i * 2] = host[i].x;
    a[i * 2 + 1] = host[i].y;
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

/** Inverse of {@link fft2dSeparableForward}: column IFFT then row IFFT (fft.js `inverseTransform`). */
function fft2dSeparableInverse(work: Float64Array) {
  const fftW = new FFT(W);
  const fftH = new FFT(H);
  const colIn = fftH.createComplexArray() as number[];
  const colOut = fftH.createComplexArray() as number[];
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      colIn[y * 2] = work[(y * W + x) * 2]!;
      colIn[y * 2 + 1] = work[(y * W + x) * 2 + 1]!;
    }
    fftH.inverseTransform(colOut, colIn);
    for (let y = 0; y < H; y++) {
      work[(y * W + x) * 2] = colOut[y * 2]!;
      work[(y * W + x) * 2 + 1] = colOut[y * 2 + 1]!;
    }
  }
  const rowIn = fftW.createComplexArray() as number[];
  const rowOut = fftW.createComplexArray() as number[];
  for (let y = 0; y < H; y++) {
    const off = y * W * 2;
    for (let i = 0; i < W * 2; i++) {
      rowIn[i] = work[off + i]!;
    }
    fftW.inverseTransform(rowOut, rowIn);
    for (let i = 0; i < W * 2; i++) {
      work[off + i] = rowOut[i]!;
    }
  }
}

type Vec2Like = { x: number; y: number };

function gpuGpuDiff(a: Vec2Like[], b: Vec2Like[]): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sumSq = 0;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const dr = a[i].x - b[i].x;
    const di = a[i].y - b[i].y;
    const e = Math.hypot(dr, di);
    maxAbs = Math.max(maxAbs, e);
    sumSq += dr * dr + di * di;
  }
  return { maxAbs, rms: Math.sqrt(sumSq / n) };
}

function gpuGpuDiffLen(a: Vec2Like[], b: Vec2Like[], len: number): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const dr = a[i].x - b[i].x;
    const di = a[i].y - b[i].y;
    const e = Math.hypot(dr, di);
    maxAbs = Math.max(maxAbs, e);
    sumSq += dr * dr + di * di;
  }
  return { maxAbs, rms: Math.sqrt(sumSq / len) };
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
    const gr = gpu[i].x;
    const gi = gpu[i].y;
    const cr = cpu[i * 2] * cpuScale;
    const ci = cpu[i * 2 + 1] * cpuScale;
    const dr = gr - cr;
    const di = gi - ci;
    const e = Math.hypot(dr, di);
    maxAbs = Math.max(maxAbs, e);
    sumSq += dr * dr + di * di;
  }
  return { maxAbs, rms: Math.sqrt(sumSq / n) };
}

function diffStatsLen(
  gpu: Vec2Like[],
  cpu: Float64Array,
  len: number,
  cpuScale: number,
): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sumSq = 0;
  for (let i = 0; i < len; i++) {
    const gr = gpu[i].x;
    const gi = gpu[i].y;
    const cr = cpu[i * 2] * cpuScale;
    const ci = cpu[i * 2 + 1] * cpuScale;
    const dr = gr - cr;
    const di = gi - ci;
    const e = Math.hypot(dr, di);
    maxAbs = Math.max(maxAbs, e);
    sumSq += dr * dr + di * di;
  }
  return { maxAbs, rms: Math.sqrt(sumSq / len) };
}

function fitScale1d(gpu: Vec2Like[], cpu: Float64Array, len: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < len; i++) {
    const cr = cpu[i * 2];
    const ci = cpu[i * 2 + 1];
    num += gpu[i].x * cr + gpu[i].y * ci;
    den += cr * cr + ci * ci;
  }
  return den > 1e-20 ? num / den : 1;
}

/** Per-element complex error between two interleaved double buffers (length `n` complex samples). */
function diffFloat64Interleaved(
  a: Float64Array,
  b: Float64Array,
  n: number,
): { maxAbs: number; rms: number } {
  let maxAbs = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const dr = a[i * 2] - b[i * 2];
    const di = a[i * 2 + 1] - b[i * 2 + 1];
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

function makeImpulseHost(nMax: number, n: number): d.v2f[] {
  return Array.from({ length: nMax }, (_, i) => (i < n && i === 0 ? d.vec2f(1, 0) : d.vec2f(0, 0)));
}

type ComplexBuf = { read: () => Promise<d.v2f[]>; write: (data: d.v2f[]) => void };

async function runLineFft1d(
  device: GPUDevice,
  strategy: LineFftStrategy,
  bufA: ComplexBuf,
  bufB: ComplexBuf,
  input: d.v2f[],
  n: number,
  numLines: number,
): Promise<Vec2Like[]> {
  bufA.write(input);
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  const outInA = strategy.dispatchLineFft(n, numLines, true, { computePass: pass });
  pass.end();
  device.queue.submit([enc.finish()]);
  const outBuf = outInA ? bufA : bufB;
  const full = (await outBuf.read()) as Vec2Like[];
  return full.slice(0, n * numLines);
}

const root = await tgpu.init();
const device = root.device;

const N_MAX_1D = 64;
const N_MULTILINE = 64;
const bufA1d = root.createBuffer(d.arrayOf(d.vec2f, N_MAX_1D * N_MULTILINE)).$usage('storage');
const bufB1d = root.createBuffer(d.arrayOf(d.vec2f, N_MAX_1D * N_MULTILINE)).$usage('storage');

for (const n of [4, 16, 64] as const) {
  const lineStrategyRadix2 = createStockhamRadix2LineStrategy({
    root,
    nMax: N_MAX_1D,
    width: n,
    height: 1,
    bufA: bufA1d,
    bufB: bufB1d,
  });
  const lineStrategyRadix4 = createStockhamRadix4LineStrategy({
    root,
    nMax: N_MAX_1D,
    width: n,
    height: 1,
    bufA: bufA1d,
    bufB: bufB1d,
  });
  const impulseHost = makeImpulseHost(N_MAX_1D * N_MULTILINE, n);
  const impulseCpu = new Float64Array(n * 2);
  impulseCpu[0] = 1;
  const ref = naiveDft1dForward(impulseCpu, n);

  const outR2 = await runLineFft1d(device, lineStrategyRadix2, bufA1d, bufB1d, impulseHost, n, 1);
  const outR4 = await runLineFft1d(device, lineStrategyRadix4, bufA1d, bufB1d, impulseHost, n, 1);

  let scaleR2 = 1;
  let dR2 = diffStatsLen(outR2, ref, n, scaleR2);
  if (dR2.maxAbs > ERR_PASS_MAX * 50) {
    const s = fitScale1d(outR2, ref, n);
    if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) {
      scaleR2 = s;
      dR2 = diffStatsLen(outR2, ref, n, scaleR2);
      console.info(
        `[fft-line-strategy-check] 1D n=${n} radix-2 vs CPU (naive DFT): applied scale=${scaleR2.toExponential(6)}`,
      );
    }
  }

  let scaleR4 = 1;
  let dR4 = diffStatsLen(outR4, ref, n, scaleR4);
  if (dR4.maxAbs > ERR_PASS_MAX * 50) {
    const s = fitScale1d(outR4, ref, n);
    if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) {
      scaleR4 = s;
      dR4 = diffStatsLen(outR4, ref, n, scaleR4);
      console.info(
        `[fft-line-strategy-check] 1D n=${n} radix-4 vs CPU (naive DFT): applied scale=${scaleR4.toExponential(6)}`,
      );
    }
  }

  const parity1d = gpuGpuDiffLen(outR4, outR2, n);
  const passR2 = dR2.maxAbs < ERR_PASS_MAX && dR2.rms < ERR_PASS_RMS;
  const passR4 = dR4.maxAbs < ERR_PASS_MAX && dR4.rms < ERR_PASS_RMS;
  const passParity = parity1d.maxAbs < ERR_PASS_MAX && parity1d.rms < ERR_PASS_RMS;
  console.info(
    `[fft-line-strategy-check] 1D impulse n=${n} radix-2 vs CPU (naive DFT): maxAbs=${dR2.maxAbs.toExponential(3)} rms=${dR2.rms.toExponential(3)} → ${passFailTag(passR2)}`,
  );
  console.info(
    `[fft-line-strategy-check] 1D impulse n=${n} radix-4 vs CPU (naive DFT): maxAbs=${dR4.maxAbs.toExponential(3)} rms=${dR4.rms.toExponential(3)} → ${passFailTag(passR4)}`,
  );
  console.info(
    `[fft-line-strategy-check] 1D impulse n=${n} radix-4 vs radix-2 (cross, both vs same CPU ref): maxAbs=${parity1d.maxAbs.toExponential(3)} rms=${parity1d.rms.toExponential(3)} → ${passFailTag(passParity)}`,
  );

  lineStrategyRadix2.destroy();
  lineStrategyRadix4.destroy();
}

{
  const lineStrategyRadix2 = createStockhamRadix2LineStrategy({
    root,
    nMax: N_MAX_1D,
    width: W,
    height: H,
    bufA: bufA1d,
    bufB: bufB1d,
  });
  const lineStrategyRadix4 = createStockhamRadix4LineStrategy({
    root,
    nMax: N_MAX_1D,
    width: W,
    height: H,
    bufA: bufA1d,
    bufB: bufB1d,
  });

  const rnd = mulberry32(SEED);
  const multiHost: d.v2f[] = [];
  for (let i = 0; i < W * H; i++) {
    multiHost.push(d.vec2f(rnd() * 2 - 1, rnd() * 2 - 1));
  }
  const fftRow = new FFT(W);
  const rowInF = fftRow.createComplexArray() as number[];
  const rowOutF = fftRow.createComplexArray() as number[];
  const multiRef = new Float64Array(W * H * 2);
  for (let line = 0; line < H; line++) {
    for (let x = 0; x < W; x++) {
      const v = multiHost[line * W + x];
      rowInF[x * 2] = v.x;
      rowInF[x * 2 + 1] = v.y;
    }
    fftRow.transform(rowOutF, rowInF);
    multiRef.set(rowOutF, line * W * 2);
  }

  const outR2multi = await runLineFft1d(
    device,
    lineStrategyRadix2,
    bufA1d,
    bufB1d,
    multiHost,
    W,
    H,
  );
  const outR4multi = await runLineFft1d(
    device,
    lineStrategyRadix4,
    bufA1d,
    bufB1d,
    multiHost,
    W,
    H,
  );

  const multiParityR2 = diffStatsLen(outR2multi, multiRef, W * H, 1);
  const multiParityR4 = diffStatsLen(outR4multi, multiRef, W * H, 1);
  const multiR4vsR2 = gpuGpuDiffLen(outR4multi, outR2multi, W * H);
  console.info(
    `[fft-line-strategy-check] 1D multi-line ${W}×${H} radix-2 vs CPU (fft.js row FFT): maxAbs=${multiParityR2.maxAbs.toExponential(3)} rms=${multiParityR2.rms.toExponential(3)} → ${passFailTag(multiParityR2.maxAbs < ERR_PASS_MAX)}`,
  );
  console.info(
    `[fft-line-strategy-check] 1D multi-line ${W}×${H} radix-4 vs CPU (fft.js row FFT): maxAbs=${multiParityR4.maxAbs.toExponential(3)} rms=${multiParityR4.rms.toExponential(3)} → ${passFailTag(multiParityR4.maxAbs < ERR_PASS_MAX)}`,
  );
  console.info(
    `[fft-line-strategy-check] 1D multi-line ${W}×${H} radix-4 vs radix-2 (cross): maxAbs=${multiR4vsR2.maxAbs.toExponential(3)} rms=${multiR4vsR2.rms.toExponential(3)} → ${passFailTag(multiR4vsR2.maxAbs < ERR_PASS_MAX)}`,
  );

  lineStrategyRadix2.destroy();
  lineStrategyRadix4.destroy();
}

bufA1d.destroy();
bufB1d.destroy();

const host = buildHostComplex();
const inputInterleaved = hostToFloat64Interleaved(host);
const cpuSpectrum = new Float64Array(inputInterleaved);
fft2dSeparableForward(cpuSpectrum);

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

let spectrumScale = 1;
let fwdR2vsCpu = diffStats(outRadix2, cpuSpectrum, spectrumScale);
if (fwdR2vsCpu.maxAbs > ERR_PASS_MAX * 50) {
  const s = fitScale1d(outRadix2, cpuSpectrum, W * H);
  if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) {
    spectrumScale = s;
    fwdR2vsCpu = diffStats(outRadix2, cpuSpectrum, spectrumScale);
    console.info(
      `[fft-line-strategy-check] applied spectrum scale=${spectrumScale.toExponential(6)} (GPU vs CPU fft.js forward)`,
    );
  }
}
const fwdR4vsCpu = diffStats(outRadix4, cpuSpectrum, spectrumScale);
const passFwdR2 = fwdR2vsCpu.maxAbs < ERR_PASS_MAX && fwdR2vsCpu.rms < ERR_PASS_RMS;
const passFwdR4 = fwdR4vsCpu.maxAbs < ERR_PASS_MAX && fwdR4vsCpu.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] 2D forward radix-2 vs CPU (fft.js separable spectrum): maxAbs=${fwdR2vsCpu.maxAbs.toExponential(3)} rms=${fwdR2vsCpu.rms.toExponential(3)} → ${passFailTag(passFwdR2)}`,
);
console.info(
  `[fft-line-strategy-check] 2D forward radix-4 vs CPU (fft.js separable spectrum): maxAbs=${fwdR4vsCpu.maxAbs.toExponential(3)} rms=${fwdR4vsCpu.rms.toExponential(3)} → ${passFailTag(passFwdR4)}`,
);

const parityR4 = diffStats(outRadix4, Float64Array.from(outRadix2.flatMap((v) => [v.x, v.y])), 1);
const parityR4Pass = parityR4.maxAbs < ERR_PASS_MAX && parityR4.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] 2D forward radix-4 vs radix-2 (cross): maxAbs=${parityR4.maxAbs.toExponential(3)} rms=${parityR4.rms.toExponential(3)} → ${passFailTag(parityR4Pass)}`,
);

fftRadix2.input.write(host);
submitEncodeForward(device, fftRadix2);
submitEncodeInverse(device, fftRadix2);
const outRadix2Rt = (await fftRadix2.output().read()) as Vec2Like[];

fftRadix4.input.write(host);
submitEncodeForward(device, fftRadix4);
submitEncodeInverse(device, fftRadix4);
const outRadix4Rt = (await fftRadix4.output().read()) as Vec2Like[];

const cpuRoundTrip = new Float64Array(inputInterleaved);
fft2dSeparableForward(cpuRoundTrip);
fft2dSeparableInverse(cpuRoundTrip);
const cpuRtSelf = diffFloat64Interleaved(cpuRoundTrip, inputInterleaved, W * H);
console.info(
  `[fft-line-strategy-check] CPU fft.js forward+inverse vs input: maxAbs=${cpuRtSelf.maxAbs.toExponential(3)} rms=${cpuRtSelf.rms.toExponential(3)} → ${passFailTag(cpuRtSelf.maxAbs < ERR_PASS_MAX)}`,
);

let inputScale = 1;
let rtR2vsCpu = diffStats(outRadix2Rt, inputInterleaved, inputScale);
if (rtR2vsCpu.maxAbs > ERR_PASS_MAX * 50) {
  const s = fitScale1d(outRadix2Rt, inputInterleaved, W * H);
  if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) {
    inputScale = s;
    rtR2vsCpu = diffStats(outRadix2Rt, inputInterleaved, inputScale);
    console.info(
      `[fft-line-strategy-check] applied round-trip scale=${inputScale.toExponential(6)} (GPU vs CPU fft.js input)`,
    );
  }
}
const rtR4vsCpu = diffStats(outRadix4Rt, inputInterleaved, inputScale);
const passRtR2 = rtR2vsCpu.maxAbs < ERR_PASS_MAX && rtR2vsCpu.rms < ERR_PASS_RMS;
const passRtR4 = rtR4vsCpu.maxAbs < ERR_PASS_MAX && rtR4vsCpu.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] round-trip radix-2 vs CPU (fft.js input): maxAbs=${rtR2vsCpu.maxAbs.toExponential(3)} rms=${rtR2vsCpu.rms.toExponential(3)} → ${passFailTag(passRtR2)}`,
);
console.info(
  `[fft-line-strategy-check] round-trip radix-4 vs CPU (fft.js input): maxAbs=${rtR4vsCpu.maxAbs.toExponential(3)} rms=${rtR4vsCpu.rms.toExponential(3)} → ${passFailTag(passRtR4)}`,
);

const rtParity = gpuGpuDiff(outRadix4Rt, outRadix2Rt);
const rtPass = rtParity.maxAbs < ERR_PASS_MAX && rtParity.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] round-trip radix-4 vs radix-2 (cross): maxAbs=${rtParity.maxAbs.toExponential(3)} rms=${rtParity.rms.toExponential(3)} → ${passFailTag(rtPass)}`,
);

fftRadix2.destroy();
fftRadix4.destroy();
root.destroy();
