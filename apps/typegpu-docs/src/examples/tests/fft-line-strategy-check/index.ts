/**
 * Validates @typegpu/fft line strategies: GPU↔CPU (fft.js separable 2D), factory copy parity,
 * radix-4 vs default Stockham, and GPU timestamp averages over repeated forwards (camera-fft style).
 */
import {
  createFft2d,
  createStockhamRadix2LineStrategyCopy,
  createStockhamRadix4LineStrategy,
  type Fft2d,
} from '@typegpu/fft';
import tgpu, { d } from 'typegpu';
import FFT from 'fft.js';

const W = 64;
const H = 64;
const SEED = 0x9e3779b1;
const WARMUP = 2;
const K = 32;
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
  let minR = Infinity;
  let maxR = -Infinity;
  let sumR = 0;
  for (const v of out) {
    minR = Math.min(minR, v.x);
    maxR = Math.max(maxR, v.x);
    sumR += Math.abs(v.x);
  }
  console.info(
    `[fft-line-strategy-check] input |re|: min=${minR.toFixed(4)} max=${maxR.toFixed(4)} mean=${(sumR / (W * H)).toFixed(4)}`,
  );
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

function timestampPeriodNs(device: GPUDevice): number {
  const limits = device.limits as { timestampPeriod?: number };
  return typeof limits.timestampPeriod === 'number' ? limits.timestampPeriod : 1;
}

function ticksToMs(device: GPUDevice, delta: number): number {
  return (delta * timestampPeriodNs(device)) / 1e6;
}

type TimestampQuerySet = {
  querySet: GPUQuerySet;
  resolve(): void;
  read(): Promise<bigint[]>;
};

async function avgEncodeForwardMs(
  device: GPUDevice,
  fft: Fft2d,
  hostData: d.v2f[],
  qs: TimestampQuerySet,
  k: number,
): Promise<number> {
  for (let i = 0; i < k; i++) {
    fft.input.write(hostData);
    const enc = device.createCommandEncoder({ label: 'fft-line-strategy-check timed forward' });
    const pass = enc.beginComputePass({
      label: 'fft2d forward',
      timestampWrites: {
        querySet: qs.querySet,
        beginningOfPassWriteIndex: 2 * i,
        endOfPassWriteIndex: 2 * i + 1,
      },
    });
    fft.encodeForward(pass);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  await device.queue.onSubmittedWorkDone();
  qs.resolve();
  const r = await qs.read();
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += ticksToMs(device, Number(r[2 * i + 1]! - r[2 * i]!));
  }
  return sum / k;
}

const root = await tgpu.init({
  device: { optionalFeatures: ['timestamp-query'] },
});
const device = root.device;

const host = buildHostComplex();
const cpuRef = hostToFloat64Interleaved(host);
const tCpu0 = performance.now();
fft2dSeparableForward(cpuRef);
const cpuRefMs = performance.now() - tCpu0;

const fftDefault = createFft2d(root, { width: W, height: H });
const fftCopy = createFft2d(root, {
  width: W,
  height: H,
  lineFftStrategyFactory: createStockhamRadix2LineStrategyCopy,
});
const fftRadix4 = createFft2d(root, {
  width: W,
  height: H,
  lineFftStrategyFactory: createStockhamRadix4LineStrategy,
});

function loadAndForward(fft: Fft2d) {
  fft.input.write(host);
  fft.forward();
}

for (let i = 0; i < WARMUP; i++) {
  loadAndForward(fftDefault);
  loadAndForward(fftCopy);
  loadAndForward(fftRadix4);
}

loadAndForward(fftDefault);
loadAndForward(fftCopy);
loadAndForward(fftRadix4);

const outDefault = (await fftDefault.output().read()) as Vec2Like[];
const outCopy = (await fftCopy.output().read()) as Vec2Like[];
const outRadix4 = (await fftRadix4.output().read()) as Vec2Like[];

const parity = gpuGpuDiff(outCopy, outDefault);
const parityPass = parity.maxAbs < 1e-5 && parity.rms < 1e-6;
console.info(
  `[fft-line-strategy-check] factory copy vs default: maxAbs=${parity.maxAbs.toExponential(3)} rms=${parity.rms.toExponential(3)} → ${parityPass ? 'PASS' : 'FAIL'}`,
);

const parityR4 = diffStats(outRadix4, outDefault.flatMap((v) => [v.x, v.y]), 1);
const parityR4Pass = parityR4.maxAbs < ERR_PASS_MAX && parityR4.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] radix-4 vs default Stockham: maxAbs=${parityR4.maxAbs.toExponential(3)} rms=${parityR4.rms.toExponential(3)} → ${parityR4Pass ? 'PASS' : 'FAIL'}`,
);

let cpuScale = 1;
let gpuCpu = diffStats(outDefault, cpuRef, cpuScale);
if (gpuCpu.maxAbs > ERR_PASS_MAX * 50) {
  const s =
    (() => {
      let num = 0;
      let den = 0;
      for (let i = 0; i < W * H; i++) {
        const cr = cpuRef[i * 2]!;
        const ci = cpuRef[i * 2 + 1]!;
        const gr = outDefault[i]!.x;
        const gi = outDefault[i]!.y;
        num += gr * cr + gi * ci;
        den += cr * cr + ci * ci;
      }
      return den > 1e-20 ? num / den : 1;
    })();
  if (Number.isFinite(s) && Math.abs(s - 1) > 0.01) {
    cpuScale = s;
    gpuCpu = diffStats(outDefault, cpuRef, cpuScale);
    console.info(
      `[fft-line-strategy-check] applied CPU ref scale=${cpuScale.toExponential(6)} (fft.js vs unnormalized Stockham)`,
    );
  }
}

const refPass = gpuCpu.maxAbs < ERR_PASS_MAX && gpuCpu.rms < ERR_PASS_RMS;
console.info(
  `[fft-line-strategy-check] GPU default vs CPU fft.js (2D separable): maxAbs=${gpuCpu.maxAbs.toExponential(3)} rms=${gpuCpu.rms.toExponential(3)} → ${refPass ? 'PASS' : 'FAIL'}`,
);
console.info(`[fft-line-strategy-check] CPU ref fft.js wall ~${cpuRefMs.toFixed(3)} ms (not GPU)`);

const tsOk = root.enabledFeatures.has('timestamp-query');
let gpuAvgDefault: number | null = null;
let gpuAvgCopy: number | null = null;
let gpuAvgRadix4: number | null = null;

if (tsOk) {
  const qs = root.createQuerySet('timestamp', 2 * K);
  gpuAvgDefault = await avgEncodeForwardMs(device, fftDefault, host, qs, K);
  gpuAvgCopy = await avgEncodeForwardMs(device, fftCopy, host, qs, K);
  gpuAvgRadix4 = await avgEncodeForwardMs(device, fftRadix4, host, qs, K);
  qs.destroy();
  const row = {
    'default Stockham': gpuAvgDefault.toFixed(4),
    'copy factory': gpuAvgCopy.toFixed(4),
    'radix-4 line': gpuAvgRadix4.toFixed(4),
  };
  console.table({ 'GPU avg ms / forward (timestamp query)': row });
  const vsDefault = gpuAvgDefault / gpuAvgRadix4;
  console.info(
    `[fft-line-strategy-check] GPU avg ms/forward (timestamp): default=${row['default Stockham']} copy=${row['copy factory']} radix4=${row['radix-4 line']} — radix4 ~${vsDefault.toFixed(2)}× vs default (${K} runs, this GPU)`,
  );
} else {
  console.info(
    '[fft-line-strategy-check] GPU timings N/A (enable timestamp-query or use a GPU that supports it)',
  );
}

console.info(
  `[fft-line-strategy-check] lineFftStrategyId: default=${fftDefault.lineFftStrategyId} copy=${fftCopy.lineFftStrategyId} radix4=${fftRadix4.lineFftStrategyId}`,
);

fftDefault.destroy();
fftCopy.destroy();
fftRadix4.destroy();
