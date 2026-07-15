import { tgpu } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  createBitonicSorter,
  createRadixSorter,
  decomposeWorkgroups,
  type RadixSorter,
  scan,
} from '@typegpu/sort';
import { randf } from '@typegpu/noise';
import { defineControls } from '../../common/defineControls.ts';

const maxBufferSize = await navigator.gpu.requestAdapter().then((adapter) => {
  if (!adapter) {
    throw new Error('No GPU adapter found');
  }
  return Math.min(adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize);
});

const subgroupRoot = await tgpu.init({
  device: {
    optionalFeatures: ['subgroups'],
    requiredLimits: {
      maxStorageBufferBindingSize: maxBufferSize,
      maxBufferSize: maxBufferSize,
    },
  },
});
const fallbackRoot = await tgpu.init();

const roots = [
  { root: subgroupRoot, label: 'subgroups' },
  { root: fallbackRoot, label: 'fallback' },
];

// reference implementations & comparison

function refSortNumeric(arr: number[], direction: 'ascending' | 'descending'): number[] {
  const out = arr.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (direction === 'descending') {
    out.reverse();
  }
  return out;
}

function refSortF32WithNaNs(arr: number[]): number[] {
  const nanCount = arr.filter((v) => Number.isNaN(v)).length;
  const rest = arr.filter((v) => !Number.isNaN(v)).toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return rest.concat(Array.from({ length: nanCount }, () => Number.NaN));
}

function compareAndLog(actual: number[], expected: number[]): boolean {
  const equal =
    actual.length === expected.length &&
    actual.every((v, i) => v === expected[i] || (Number.isNaN(v) && Number.isNaN(expected[i])));
  if (equal) {
    return true;
  }

  if (actual.length !== expected.length) {
    console.error(`  Mismatch: length ${actual.length} !== ${expected.length}`);
  } else {
    const idx = actual.findIndex(
      (v, i) => v !== expected[i] && !(Number.isNaN(v) && Number.isNaN(expected[i])),
    );
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

// input generators

function randomU32Array(length: number): number[] {
  return Array.from({ length }, () => Math.floor(Math.random() * 0x100000000) >>> 0);
}

function randomI32Array(length: number): number[] {
  const arr = Array.from({ length }, () => Math.floor(Math.random() * 0x100000000) | 0);
  if (length >= 4) {
    arr[0] = -2147483648;
    arr[1] = 2147483647;
    arr[2] = 0;
    arr[3] = -1;
  }
  return arr;
}

function randomF32Array(length: number): number[] {
  const arr = Array.from({ length }, () =>
    Math.fround((Math.random() - 0.5) * 2 ** (Math.random() * 80 - 40)),
  );
  if (length >= 6) {
    arr[0] = Number.POSITIVE_INFINITY;
    arr[1] = Number.NEGATIVE_INFINITY;
    arr[2] = 0;
    arr[3] = -0;
    arr[4] = Math.fround(1e-45);
    arr[5] = Math.fround(-1e-45);
  }
  return arr;
}

// radix test runners

type Root = typeof subgroupRoot;
type KeySchema = d.U32 | d.I32 | d.F32;

async function runRadixAndRead(
  root: Root,
  keySchema: KeySchema,
  arr: number[],
  direction: 'ascending' | 'descending',
): Promise<number[]> {
  const buffer = root
    .createBuffer(d.arrayOf(keySchema as d.U32, arr.length), arr)
    .$usage('storage');
  const sorter = createRadixSorter(root, buffer, { direction });
  sorter.run();
  const actual = await buffer.read();
  sorter.destroy();
  buffer.destroy();
  return actual;
}

async function testRadixU32Sizes(root: Root): Promise<boolean> {
  const sizes = [1, 2, 3, 255, 256, 257, 2047, 2048, 2049, 65537];
  let ok = true;
  for (const size of sizes) {
    const arr = randomU32Array(size);
    const actual = await runRadixAndRead(root, d.u32, arr, 'ascending');
    if (!compareAndLog(actual, refSortNumeric(arr, 'ascending'))) {
      console.error(`  (size ${size})`);
      ok = false;
    }
  }
  return ok;
}

async function testRadixU32Large(root: Root): Promise<boolean> {
  const arr = randomU32Array(1048577);
  const actual = await runRadixAndRead(root, d.u32, arr, 'ascending');
  return compareAndLog(actual, refSortNumeric(arr, 'ascending'));
}

async function testRadixU32Descending(root: Root): Promise<boolean> {
  const arr = randomU32Array(65537);
  const actual = await runRadixAndRead(root, d.u32, arr, 'descending');
  return compareAndLog(actual, refSortNumeric(arr, 'descending'));
}

async function testRadixI32(root: Root): Promise<boolean> {
  const arr = randomI32Array(65537);
  const actual = await runRadixAndRead(root, d.i32, arr, 'ascending');
  return compareAndLog(actual, refSortNumeric(arr, 'ascending'));
}

async function testRadixI32Descending(root: Root): Promise<boolean> {
  const arr = randomI32Array(4099);
  const actual = await runRadixAndRead(root, d.i32, arr, 'descending');
  return compareAndLog(actual, refSortNumeric(arr, 'descending'));
}

async function testRadixF32(root: Root): Promise<boolean> {
  const arr = randomF32Array(65537);
  const actual = await runRadixAndRead(root, d.f32, arr, 'ascending');
  return compareAndLog(actual, refSortNumeric(arr, 'ascending'));
}

async function testRadixF32Descending(root: Root): Promise<boolean> {
  const arr = randomF32Array(4099);
  const actual = await runRadixAndRead(root, d.f32, arr, 'descending');
  return compareAndLog(actual, refSortNumeric(arr, 'descending'));
}

async function testRadixF32NaNs(root: Root): Promise<boolean> {
  const arr = randomF32Array(4099);
  for (let i = 0; i < 7; i++) {
    arr[100 + i * 500] = Number.NaN;
  }
  const actual = await runRadixAndRead(root, d.f32, arr, 'ascending');
  return compareAndLog(actual, refSortF32WithNaNs(arr));
}

async function testRadixRunTwice(root: Root): Promise<boolean> {
  const arr = randomU32Array(65537);
  const buffer = root.createBuffer(d.arrayOf(d.u32, arr.length), arr).$usage('storage');
  const sorter = createRadixSorter(root, buffer);
  sorter.run();
  sorter.run();
  const actual = await buffer.read();
  sorter.destroy();
  buffer.destroy();
  return compareAndLog(actual, refSortNumeric(arr, 'ascending'));
}

async function testRadixStability(root: Root): Promise<boolean> {
  const length = 100003;
  const keys = Array.from({ length }, () => Math.floor(Math.random() * 64));
  const values = Array.from({ length }, (_, i) => i);

  const keyBuffer = root.createBuffer(d.arrayOf(d.u32, length), keys).$usage('storage');
  const valueBuffer = root.createBuffer(d.arrayOf(d.u32, length), values).$usage('storage');
  const sorter = createRadixSorter(root, keyBuffer, { values: valueBuffer });
  sorter.run();
  const actualKeys = await keyBuffer.read();
  const actualValues = await valueBuffer.read();
  sorter.destroy();
  keyBuffer.destroy();
  valueBuffer.destroy();

  if (!compareAndLog(actualKeys, refSortNumeric(keys, 'ascending'))) {
    return false;
  }

  for (let i = 1; i < length; i++) {
    const [key, value] = [actualKeys[i] as number, actualValues[i] as number];
    const [prevKey, prevValue] = [actualKeys[i - 1] as number, actualValues[i - 1] as number];
    if ((keys[value] as number) !== key) {
      console.error(`  value ${value} at index ${i} does not map back to key ${key}`);
      return false;
    }
    if (key === prevKey && value <= prevValue) {
      console.error(`  stability violated at index ${i}: values ${prevValue} -> ${value}`);
      return false;
    }
  }
  return true;
}

async function testRadixVec4fPayload(root: Root): Promise<boolean> {
  const length = 10000;
  const keys = Array.from({ length }, () => Math.floor(Math.random() * 256));
  const values = Array.from({ length }, (_, i) => d.vec4f(i, 0, 0, 0));

  const keyBuffer = root.createBuffer(d.arrayOf(d.u32, length), keys).$usage('storage');
  const valueBuffer = root.createBuffer(d.arrayOf(d.vec4f, length), values).$usage('storage');
  const sorter = createRadixSorter(root, keyBuffer, { values: valueBuffer });
  sorter.run();
  const actualKeys = await keyBuffer.read();
  const actualValues = await valueBuffer.read();
  sorter.destroy();
  keyBuffer.destroy();
  valueBuffer.destroy();

  const expectedOrder = keys
    .map((key, i) => ({ key, i }))
    .toSorted((a, b) => a.key - b.key)
    .map((entry) => entry.i);

  return (
    compareAndLog(actualKeys, refSortNumeric(keys, 'ascending')) &&
    compareAndLog(
      actualValues.map((v) => v.x),
      expectedOrder,
    )
  );
}

// composition tests

async function testRadixIntoUserEncoder(root: Root): Promise<boolean> {
  const arr = randomU32Array(4099);
  const buffer = root.createBuffer(d.arrayOf(d.u32, arr.length), arr).$usage('storage');
  const sorter = createRadixSorter(root, buffer);

  const encoder = root.device.createCommandEncoder();
  sorter.run({ encoder });
  root.device.queue.submit([encoder.finish()]);

  const actual = await buffer.read();
  sorter.destroy();
  buffer.destroy();
  return compareAndLog(actual, refSortNumeric(arr, 'ascending'));
}

async function testTwoSortersIntoUserPass(root: Root): Promise<boolean> {
  const arrA = randomU32Array(4099);
  const arrB = randomF32Array(2048);
  const bufferA = root.createBuffer(d.arrayOf(d.u32, arrA.length), arrA).$usage('storage');
  const bufferB = root.createBuffer(d.arrayOf(d.f32, arrB.length), arrB).$usage('storage');
  const sorterA = createRadixSorter(root, bufferA);
  const sorterB = createRadixSorter(root, bufferB, { direction: 'descending' });

  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  sorterA.run({ pass });
  sorterB.run({ pass });
  pass.end();
  root.device.queue.submit([encoder.finish()]);

  const actualA = await bufferA.read();
  const actualB = await bufferB.read();
  sorterA.destroy();
  sorterB.destroy();
  bufferA.destroy();
  bufferB.destroy();
  return (
    compareAndLog(actualA, refSortNumeric(arrA, 'ascending')) &&
    compareAndLog(actualB, refSortNumeric(arrB, 'descending'))
  );
}

// bitonic sanity tests

async function testBitonicU32(root: Root): Promise<boolean> {
  const arr = randomU32Array(1000);
  const buffer = root.createBuffer(d.arrayOf(d.u32, arr.length), arr).$usage('storage');
  const sorter = createBitonicSorter(root, buffer);
  sorter.run();
  const actual = await buffer.read();
  sorter.destroy();
  buffer.destroy();
  return compareAndLog(actual, refSortNumeric(arr, 'ascending'));
}

async function testBitonicDescending(root: Root): Promise<boolean> {
  const arr = randomU32Array(4096);
  const buffer = root.createBuffer(d.arrayOf(d.u32, arr.length), arr).$usage('storage');
  const sorter = createBitonicSorter(root, buffer, {
    compare: (a, b) => {
      'use gpu';
      return a > b;
    },
    paddingValue: 0,
  });
  sorter.run();
  const actual = await buffer.read();
  sorter.destroy();
  buffer.destroy();
  return compareAndLog(actual, refSortNumeric(arr, 'descending'));
}

// huge buffer test (past the 65535 workgroups-per-dimension limit), GPU-verified

const WORKGROUP_SIZE = 256;

const fillLayout = tgpu.bindGroupLayout({
  data: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

const fillKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;
  const idx = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;
  if (idx >= fillLayout.$.data.length) {
    return;
  }
  randf.seed3(d.vec3f(d.f32(idx & 0xffff), d.f32(idx >> 16), 0.5));
  const hi = d.u32(std.floor(randf.sample() * 65536));
  const lo = d.u32(std.floor(randf.sample() * 65536));
  fillLayout.$.data[idx] = (hi << 16) | lo;
});

const checkLayout = tgpu.bindGroupLayout({
  data: { storage: d.arrayOf(d.u32), access: 'readonly' },
  descents: { storage: d.arrayOf(d.atomic(d.u32)), access: 'mutable' },
});

const checkSortedKernel = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;
  const idx = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;
  if (idx + 1 >= checkLayout.$.data.length) {
    return;
  }
  if ((checkLayout.$.data[idx] as number) > (checkLayout.$.data[idx + 1] as number)) {
    std.atomicAdd(checkLayout.$.descents[0] as d.atomicU32, 1);
  }
});

const fillPipeline = subgroupRoot.createComputePipeline({ compute: fillKernel });
const checkPipeline = subgroupRoot.createComputePipeline({ compute: checkSortedKernel });

async function wrappingSum(root: Root, buffer: Parameters<typeof scan>[1]['inputBuffer']) {
  const result = scan(root, {
    inputBuffer: buffer,
    operation: std.add,
    identityElement: 0,
    dataType: d.u32,
  });
  return (await result.read())[0];
}

async function testHugeBuffer(): Promise<boolean> {
  const root = subgroupRoot;
  const length = 2 ** 27 + 5;
  if (length * 4 > maxBufferSize) {
    console.warn(`Skipping huge buffer test: needs ${length * 4} bytes, limit ${maxBufferSize}`);
    return true;
  }

  const buffer = root.createBuffer(d.arrayOf(d.u32, length)).$usage('storage');
  const descents = root.createBuffer(d.arrayOf(d.atomic(d.u32), 1), [0]).$usage('storage');
  let sorter: RadixSorter | null = null;

  try {
    fillPipeline
      .with(root.createBindGroup(fillLayout, { data: buffer }))
      .dispatchWorkgroups(...decomposeWorkgroups(Math.ceil(length / WORKGROUP_SIZE)));

    const sumBefore = await wrappingSum(root, buffer);

    sorter = createRadixSorter(root, buffer);
    sorter.run();

    const sumAfter = await wrappingSum(root, buffer);

    checkPipeline
      .with(root.createBindGroup(checkLayout, { data: buffer, descents }))
      .dispatchWorkgroups(...decomposeWorkgroups(Math.ceil(length / WORKGROUP_SIZE)));
    const descentCount = (await descents.read())[0] as unknown as number;

    if (descentCount !== 0) {
      console.error(`  huge buffer not sorted: ${descentCount} descending adjacent pairs`);
      return false;
    }
    if (sumBefore !== sumAfter) {
      console.error(`  huge buffer checksum mismatch: ${sumBefore} !== ${sumAfter}`);
      return false;
    }
    return true;
  } finally {
    sorter?.destroy();
    buffer.destroy();
    descents.destroy();
  }
}

// running the tests

async function runTest(name: string, fn: () => Promise<boolean>): Promise<boolean> {
  const passed = await fn();
  if (!passed) {
    console.error(`FAILED: ${name}`);
  }
  return passed;
}

const radixTests = {
  testRadixU32Sizes,
  testRadixU32Large,
  testRadixU32Descending,
  testRadixI32,
  testRadixI32Descending,
  testRadixF32,
  testRadixF32Descending,
  testRadixF32NaNs,
  testRadixRunTwice,
  testRadixStability,
  testRadixVec4fPayload,
  testRadixIntoUserEncoder,
  testTwoSortersIntoUserPass,
};

async function runTests(): Promise<boolean> {
  let result = true;

  for (const { root, label } of roots) {
    const probe = root.createBuffer(d.arrayOf(d.u32, 4), [3, 2, 1, 0]).$usage('storage');
    const probeSorter = createRadixSorter(root, probe);
    console.log(
      `--- radix tests on '${label}' root (scatter path: ${
        probeSorter.usesSubgroups ? 'subgroups' : 'fallback'
      }) ---`,
    );
    probeSorter.destroy();
    probe.destroy();

    for (const [name, fn] of Object.entries(radixTests)) {
      result = (await runTest(`${label}: ${name}`, () => fn(root))) && result;
    }
  }

  result = (await runTest('testBitonicU32', () => testBitonicU32(subgroupRoot))) && result;
  result =
    (await runTest('testBitonicDescending', () => testBitonicDescending(subgroupRoot))) && result;

  return result;
}

const maybeTable = document.querySelector<HTMLDivElement>('.result');
if (!maybeTable) {
  throw new Error('Nowhere to display the results');
}
const table: HTMLDivElement = maybeTable;

let testsPassed: boolean | null = null;

void runTests().then((result) => {
  testsPassed = result;
  table.innerText = `Tests ${result ? 'succeeded' : 'failed'}.`;
  console.log(`Sort tests ${result ? 'succeeded' : 'FAILED'}.`);
});

async function runHugeTest(): Promise<void> {
  if (testsPassed === null) {
    table.innerText = 'Tests are still running.';
    return;
  }
  table.innerText = 'Running huge buffer test (537MB, >65535 tiles)...';
  const passed = await runTest('testHugeBuffer', testHugeBuffer);
  table.innerText = `Huge buffer test ${passed ? 'succeeded' : 'failed'}.`;
  console.log(`Huge buffer test ${passed ? 'succeeded' : 'FAILED'}.`);
}

export const controls = defineControls({
  'Test Huge Buffer': { onButtonClick: runHugeTest },
});

export function onCleanup() {
  subgroupRoot.destroy();
  fallbackRoot.destroy();
}
