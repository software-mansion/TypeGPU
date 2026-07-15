import { tgpu } from 'typegpu';
import * as d from 'typegpu/data';
import {
  type BinaryOp,
  createPrefixScanComputer,
  prefixScan,
  scan,
  type ScanElementType,
} from '@typegpu/sort';
import * as std from 'typegpu/std';
import { defineControls } from '../../common/defineControls.ts';
import { addFn, concat10, isArrayEqual, mulFn, prefixScanJS, scanJS } from './functions.ts';

const root = await tgpu.init({
  device: { requiredFeatures: ['timestamp-query'] },
});

function compareAndLog(actual: number[], expected: number[]): boolean {
  if (isArrayEqual(actual, expected)) {
    return true;
  }

  if (actual.length !== expected.length) {
    console.error(`  Mismatch: length ${actual.length} !== ${expected.length}`);
  } else if (actual.length <= 32) {
    console.error('  actual:  ', actual);
    console.error('  expected:', expected);
  } else {
    const idx = actual.findIndex((v, i) => v !== expected[i]);
    const lo = Math.max(0, idx - 2);
    const hi = Math.min(actual.length, idx + 3);
    console.error(
      `  first mismatch at index ${idx} (showing [${lo}..${hi - 1}] of ${actual.length}):`,
    );
    console.error('  actual:  ', actual.slice(lo, hi));
    console.error('  expected:', expected.slice(lo, hi));
  }

  return false;
}

async function runAndCompare(arr: number[], op: BinaryOp, scanOnly: boolean) {
  const input = root.createBuffer(d.arrayOf(d.f32, arr.length), arr).$usage('storage');

  const output = scanOnly
    ? scan(root, {
        inputBuffer: input,
        operation: op.operation,
        identityElement: op.identityElement,
      })
    : prefixScan(root, {
        inputBuffer: input,
        outputBuffer: input,
        operation: op.operation,
        identityElement: op.identityElement,
      });

  const actual = await output.read();
  const expected = scanOnly ? scanJS(arr, op) : prefixScanJS(arr, op);
  return compareAndLog(actual, expected);
}

async function runAndCompareTyped(
  arr: number[],
  op: BinaryOp,
  dataType: ScanElementType,
  scanOnly: boolean,
) {
  const input = root.createBuffer(d.arrayOf(dataType, arr.length), arr).$usage('storage');

  const output = scanOnly
    ? scan(root, {
        inputBuffer: input,
        operation: op.operation,
        identityElement: op.identityElement,
        dataType,
      })
    : prefixScan(root, {
        inputBuffer: input,
        outputBuffer: input,
        operation: op.operation,
        identityElement: op.identityElement,
        dataType,
      });

  const actual = await output.read();
  const expected = scanOnly ? scanJS(arr, op) : prefixScanJS(arr, op);
  return compareAndLog(actual, expected);
}

// single element f32 tests

async function testAdd8(): Promise<boolean> {
  const arr = [-4, -3, -2, -1, 0, 2, 4, 6];
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testAdd123(): Promise<boolean> {
  const arr = Array.from({ length: 123 }, () => 2);
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testMul(): Promise<boolean> {
  const arr = Array.from({ length: 16 }, () => 2);
  const op = { operation: mulFn, identityElement: 1 };
  return runAndCompare(arr, op, true);
}

async function testStdMax(): Promise<boolean> {
  const arr = Array.from({ length: 16 }, (_, i) => i);
  const op = { operation: std.max, identityElement: -9999 };
  return runAndCompare(arr, op, true);
}

async function testConcat(): Promise<boolean> {
  const arr = [0, 0, 0, 1, 0, 2, 0, 0, 3, 4, 5, 0, 0, 0, 6];
  const op = { operation: concat10, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testLength1(): Promise<boolean> {
  const arr = [42];
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testLength65537(): Promise<boolean> {
  const arr = Array.from({ length: 65537 }, () => 1);
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testLength16777217(): Promise<boolean> {
  const arr = Array.from({ length: 16777217 }, () => 0);
  arr[0] = 1;
  arr[16777216] = 2;
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testDoesNotDestroyBuffer(): Promise<boolean> {
  const input = root.createBuffer(d.arrayOf(d.f32, 8), [1, 2, 3, 4, 5, 6, 7, 8]).$usage('storage');

  scan(root, {
    inputBuffer: input,
    operation: addFn,
    identityElement: 0,
  });

  return compareAndLog(await input.read(), [1, 2, 3, 4, 5, 6, 7, 8]);
}

async function testDoesNotCacheBuffers(): Promise<boolean> {
  const op = { operation: addFn, identityElement: 0 };

  const input1 = root.createBuffer(d.arrayOf(d.f32, 8), [1, 2, 3, 4, 5, 6, 7, 8]).$usage('storage');

  const output1 = scan(root, {
    inputBuffer: input1,
    operation: op.operation,
    identityElement: op.identityElement,
  });

  const input2 = root
    .createBuffer(
      d.arrayOf(d.f32, 10),
      Array.from({ length: 10 }, () => 1),
    )
    .$usage('storage');

  const output2 = scan(root, {
    inputBuffer: input2,
    operation: op.operation,
    identityElement: op.identityElement,
  });

  return compareAndLog(await output1.read(), [36]) && compareAndLog(await output2.read(), [10]);
}

// prefix f32 tests

async function testPrefixAdd8(): Promise<boolean> {
  const arr = [-4, -3, -2, -1, 0, 2, 4, 6];
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixAdd123(): Promise<boolean> {
  const arr = Array.from({ length: 123 }, () => 2);
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixMul(): Promise<boolean> {
  const arr = Array.from({ length: 16 }, () => 2);
  const op = { operation: mulFn, identityElement: 1 };
  return runAndCompare(arr, op, false);
}

async function testPrefixStdMax(): Promise<boolean> {
  const arr = Array.from({ length: 16 }, (_, i) => i);
  const op = { operation: std.max, identityElement: -9999 };
  return runAndCompare(arr, op, false);
}

async function testPrefixConcat(): Promise<boolean> {
  const arr = [0, 0, 0, 1, 0, 2, 0, 0, 3, 4, 5, 0, 0, 0, 6];
  const op = { operation: concat10, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixLength1(): Promise<boolean> {
  const arr = [42];
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixLength65537(): Promise<boolean> {
  const arr = Array.from({ length: 65537 }, () => 1);
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixLength16777217(): Promise<boolean> {
  const arr = Array.from({ length: 16777217 }, () => 0);
  arr[0] = 1;
  arr[16777216] = 2;
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixDoesNotDestroyBuffer(): Promise<boolean> {
  const input = root.createBuffer(d.arrayOf(d.f32, 8), [1, 2, 3, 4, 5, 6, 7, 8]).$usage('storage');
  const output = root.createBuffer(d.arrayOf(d.f32, 8)).$usage('storage');
  prefixScan(root, {
    inputBuffer: input,
    outputBuffer: output,
    operation: addFn,
    identityElement: 0,
  });
  return compareAndLog(await input.read(), [1, 2, 3, 4, 5, 6, 7, 8]);
}

async function testPrefixDoesNotCacheBuffers(): Promise<boolean> {
  const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
  const arr2 = Array.from({ length: 10 }, () => 1);
  const op = { operation: addFn, identityElement: 0 };

  const input1 = root.createBuffer(d.arrayOf(d.f32, arr1.length), arr1).$usage('storage');

  const output1 = prefixScan(root, {
    inputBuffer: input1,
    outputBuffer: input1,
    operation: op.operation,
    identityElement: op.identityElement,
  });

  const input2 = root.createBuffer(d.arrayOf(d.f32, arr2.length), arr2).$usage('storage');

  const output2 = prefixScan(root, {
    inputBuffer: input2,
    outputBuffer: input2,
    operation: op.operation,
    identityElement: op.identityElement,
  });

  return (
    compareAndLog(await output1.read(), prefixScanJS(arr1, op)) &&
    compareAndLog(await output2.read(), prefixScanJS(arr2, op))
  );
}

// integer element type tests

async function testU32Prefix65537(): Promise<boolean> {
  const arr = Array.from({ length: 65537 }, () => 1);
  const op = { operation: std.add, identityElement: 0 };
  return runAndCompareTyped(arr, op, d.u32, false);
}

async function testU32Reduce(): Promise<boolean> {
  const arr = Array.from({ length: 123 }, (_, i) => i % 7);
  const op = { operation: std.add, identityElement: 0 };
  return runAndCompareTyped(arr, op, d.u32, true);
}

async function testI32PrefixNegatives(): Promise<boolean> {
  const arr = Array.from({ length: 4099 }, (_, i) => (i % 2 === 0 ? -3 : 2));
  const op = { operation: std.add, identityElement: 0 };
  return runAndCompareTyped(arr, op, d.i32, false);
}

async function testI32Max(): Promise<boolean> {
  const arr = Array.from({ length: 257 }, (_, i) => ((i * 37) % 513) - 256);
  const op = { operation: std.max, identityElement: -2147483647 };
  return runAndCompareTyped(arr, op, d.i32, true);
}

// composition tests

async function testRecordsIntoUserEncoder(): Promise<boolean> {
  const arr = Array.from({ length: 4099 }, () => 1);
  const input = root.createBuffer(d.arrayOf(d.u32, arr.length), arr).$usage('storage');

  const computer = createPrefixScanComputer(root, {
    operation: std.add,
    identityElement: 0,
    dataType: d.u32,
  });
  const plan = computer.prepare(input);

  const encoder = root.device.createCommandEncoder();
  plan.run({ encoder });
  root.device.queue.submit([encoder.finish()]);

  const actual = await input.read();
  const expected = prefixScanJS(arr, { operation: std.add, identityElement: 0 });
  plan.destroy();
  return compareAndLog(actual, expected);
}

async function testRecordsIntoUserPass(): Promise<boolean> {
  const arr = Array.from({ length: 4099 }, () => 2);
  const input = root.createBuffer(d.arrayOf(d.u32, arr.length), arr).$usage('storage');

  const computer = createPrefixScanComputer(root, {
    operation: std.add,
    identityElement: 0,
    dataType: d.u32,
  });
  const plan = computer.prepare(input);

  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  plan.run({ pass });
  pass.end();
  root.device.queue.submit([encoder.finish()]);

  const actual = await input.read();
  const expected = prefixScanJS(arr, { operation: std.add, identityElement: 0 });
  plan.destroy();
  return compareAndLog(actual, expected);
}

// benchmark

const BENCH_SIZES = [2_048, 65_536, 1_048_576, 16_777_216];
const BENCH_WARMUP = 3;
const BENCH_RUNS = 10;

async function benchmarkSize(size: number): Promise<number> {
  const inputData = Array.from({ length: size }, () => 1);
  const inputBuffer = root.createBuffer(d.arrayOf(d.f32, size), inputData).$usage('storage');
  const outputBuffer = root.createBuffer(d.arrayOf(d.f32, size)).$usage('storage');

  for (let i = 0; i < BENCH_WARMUP; i++) {
    prefixScan(root, { inputBuffer, outputBuffer, operation: addFn, identityElement: 0 });
    await root.device.queue.onSubmittedWorkDone();
  }

  let total = 0;
  for (let i = 0; i < BENCH_RUNS; i++) {
    const t0 = performance.now();
    prefixScan(root, { inputBuffer, outputBuffer, operation: addFn, identityElement: 0 });
    await root.device.queue.onSubmittedWorkDone();
    total += performance.now() - t0;
  }

  const avgMs = total / BENCH_RUNS;
  inputBuffer.destroy();
  outputBuffer.destroy();
  return avgMs;
}

async function runBenchmarks(): Promise<void> {
  console.log('=== Prefix Scan Benchmark ===');
  for (const size of BENCH_SIZES) {
    const avgMs = await benchmarkSize(size);
    console.log(
      `  size ${size.toLocaleString().padStart(12)}: ${avgMs.toFixed(2)} ms avg (${BENCH_RUNS} runs)`,
    );
  }
  console.log('==============================');
}

// running the tests

async function runTest(name: string, fn: () => Promise<boolean>): Promise<boolean> {
  const passed = await fn();
  if (!passed) {
    console.error(`FAILED: ${name}`);
  }
  return passed;
}

async function runTests(): Promise<boolean> {
  let result = true;

  result = (await runTest('testAdd8', testAdd8)) && result;
  result = (await runTest('testAdd123', testAdd123)) && result;
  result = (await runTest('testMul', testMul)) && result;
  result = (await runTest('testStdMax', testStdMax)) && result;
  result = (await runTest('testConcat', testConcat)) && result;
  result = (await runTest('testLength1', testLength1)) && result;
  result = (await runTest('testLength65537', testLength65537)) && result;
  result = (await runTest('testLength16777217', testLength16777217)) && result;
  result = (await runTest('testDoesNotDestroyBuffer', testDoesNotDestroyBuffer)) && result;
  result = (await runTest('testDoesNotCacheBuffers', testDoesNotCacheBuffers)) && result;

  result = (await runTest('testPrefixAdd8', testPrefixAdd8)) && result;
  result = (await runTest('testPrefixAdd123', testPrefixAdd123)) && result;
  result = (await runTest('testPrefixMul', testPrefixMul)) && result;
  result = (await runTest('testPrefixStdMax', testPrefixStdMax)) && result;
  result = (await runTest('testPrefixConcat', testPrefixConcat)) && result;
  result = (await runTest('testPrefixLength1', testPrefixLength1)) && result;
  result = (await runTest('testPrefixLength65537', testPrefixLength65537)) && result;
  result = (await runTest('testPrefixLength16777217', testPrefixLength16777217)) && result;
  result =
    (await runTest('testPrefixDoesNotDestroyBuffer', testPrefixDoesNotDestroyBuffer)) && result;
  result =
    (await runTest('testPrefixDoesNotCacheBuffers', testPrefixDoesNotCacheBuffers)) && result;

  result = (await runTest('testU32Prefix65537', testU32Prefix65537)) && result;
  result = (await runTest('testU32Reduce', testU32Reduce)) && result;
  result = (await runTest('testI32PrefixNegatives', testI32PrefixNegatives)) && result;
  result = (await runTest('testI32Max', testI32Max)) && result;
  result = (await runTest('testRecordsIntoUserEncoder', testRecordsIntoUserEncoder)) && result;
  result = (await runTest('testRecordsIntoUserPass', testRecordsIntoUserPass)) && result;

  return result;
}

const maybeTable = document.querySelector<HTMLDivElement>('.result');
if (!maybeTable) {
  throw new Error('Nowhere to display the results');
}
const table: HTMLDivElement = maybeTable;

let testsPassed: boolean | null = null;
let benchmarkPromise: Promise<void> | null = null;

void runTests().then((result) => {
  testsPassed = result;
  table.innerText = `Tests ${result ? 'succeeded' : 'failed'}.`;
});

async function startBenchmarks(): Promise<void> {
  if (testsPassed === null) {
    table.innerText = 'Tests are still running.';
    return;
  }

  if (!testsPassed) {
    table.innerText = 'Tests failed. Benchmarks skipped.';
    return;
  }

  if (benchmarkPromise) {
    return benchmarkPromise;
  }

  table.innerText = 'Tests succeeded. Running benchmarks...';
  benchmarkPromise = runBenchmarks()
    .then(() => {
      table.innerText = 'Tests succeeded. Benchmark complete (see console).';
    })
    .finally(() => {
      benchmarkPromise = null;
    });

  return benchmarkPromise;
}

// #region Example controls and cleanup

export const controls = defineControls({
  'Run benchmarks': {
    onButtonClick: startBenchmarks,
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
