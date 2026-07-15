import { createPrefixScanComputer } from '@typegpu/sort';
import type { TgpuRoot } from 'typegpu';
import { d, std } from 'typegpu';

type SumResult = {
  success: boolean;
  jsTime: number;
  uploadTime: number;
  computeTime: number;
  syncTime: number;
  readbackTime: number;
};

const ITERATIONS = 3;

// Exclusive (Blelloch) scan — the result starts with the identity element
function prefixSumOnJS(arr: Float32Array) {
  let acc = 0;
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i];
    arr[i] = acc;
    acc += value;
  }
  return arr;
}

function arraysEqual(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function median(values: number[]): number {
  return values.toSorted((a, b) => a - b)[values.length >> 1];
}

export async function performCalculationsWithTime(
  root: TgpuRoot,
  input: Float32Array<ArrayBuffer>,
): Promise<SumResult> {
  const device = root.device;
  const inputBuffer = root.createBuffer(d.arrayOf(d.f32, input.length)).$usage('storage');
  const computer = createPrefixScanComputer(root, { operation: std.add, identityElement: 0 });
  const plan = computer.prepare(inputBuffer);
  const querySet = root.createQuerySet('timestamp', 2);
  const readbackBuffer = device.createBuffer({
    size: input.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const upload = () => device.queue.writeBuffer(root.unwrap(inputBuffer), 0, input);

  const compute = async () => {
    const encoder = device.createCommandEncoder();
    plan.run({ encoder, querySet });
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
  };

  const readback = async () => {
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(root.unwrap(inputBuffer), 0, readbackBuffer, 0, input.byteLength);
    device.queue.submit([encoder.finish()]);
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    return new Float32Array(readbackBuffer.getMappedRange());
  };

  const jsTimes: number[] = [];
  let jsResult: Float32Array = new Float32Array(0);
  for (let i = 0; i < ITERATIONS; i++) {
    const copy = input.slice();
    const start = performance.now();
    jsResult = prefixSumOnJS(copy);
    jsTimes.push(performance.now() - start);
  }

  // Untimed warmup — compiles the pipelines and doubles as the correctness check
  upload();
  await compute();
  const success = arraysEqual(jsResult, await readback());
  readbackBuffer.unmap();

  const uploadTimes: number[] = [];
  const computeTimes: number[] = [];
  const syncTimes: number[] = [];
  const readbackTimes: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    upload();
    const t1 = performance.now();
    await compute();
    const t2 = performance.now();
    await readback();
    const t3 = performance.now();
    readbackBuffer.unmap();

    querySet.resolve();
    const timestamps = await querySet.read();
    const passMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;

    uploadTimes.push(t1 - t0);
    computeTimes.push(passMs);
    syncTimes.push(Math.max(0, t2 - t1 - passMs));
    readbackTimes.push(t3 - t2);
  }

  plan.destroy();
  querySet.destroy();
  inputBuffer.destroy();
  readbackBuffer.destroy();

  return {
    success,
    jsTime: median(jsTimes),
    uploadTime: median(uploadTimes),
    computeTime: median(computeTimes),
    syncTime: median(syncTimes),
    readbackTime: median(readbackTimes),
  };
}
