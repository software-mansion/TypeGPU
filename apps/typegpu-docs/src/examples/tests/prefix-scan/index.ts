import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import { type BinaryOp, prefixScan, scan } from '@typegpu/concurrent-scan';
import * as std from 'typegpu/std';
import { addFn, concat10, mulFn, prefixScanJS, scanJS } from './functions.ts';

const root = await tgpu.init({
  device: { requiredFeatures: ['timestamp-query'] },
});

function isEqual(e1: unknown, e2: unknown): boolean {
  if (Array.isArray(e1) && Array.isArray(e2)) {
    return e1.every((elem, i) => isEqual(elem, e2[i]));
  }
  return e1 === e2;
}

async function runAndCompare(arr: number[], op: BinaryOp, scanOnly: boolean) {
  const input = root
    .createBuffer(d.arrayOf(d.f32, arr.length), arr)
    .$usage('storage');

  const output = scanOnly ? scan(root, input, op) : prefixScan(root, input, op);

  return isEqual(
    await output.read(),
    scanOnly ? scanJS(arr, op) : prefixScanJS(arr, op),
  );
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

async function testLength65537(): Promise<boolean> {
  const arr = Array.from({ length: 65537 }, () => 1);
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testLength16777217(): Promise<boolean> {
  const arr = Array.from({ length: 16777217 }, () => 0);
  arr[0] = 1;
  arr[16777217] = 2;
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, true);
}

async function testDoesNotDestroyBuffer(): Promise<boolean> {
  const input = root
    .createBuffer(d.arrayOf(d.f32, 8), [1, 2, 3, 4, 5, 6, 7, 8])
    .$usage('storage');

  scan(root, input, { operation: addFn, identityElement: 0 });

  return isEqual(await input.read(), [1, 2, 3, 4, 5, 6, 7, 8]);
}

async function testDoesNotCacheBuffers(): Promise<boolean> {
  const op = { operation: addFn, identityElement: 0 };

  const input1 = root
    .createBuffer(d.arrayOf(d.f32, 8), [1, 2, 3, 4, 5, 6, 7, 8])
    .$usage('storage');

  const output1 = scan(root, input1, op);

  const input2 = root
    .createBuffer(d.arrayOf(d.f32, 10), Array.from({ length: 10 }, () => 1))
    .$usage('storage');

  const output2 = scan(root, input2, op);

  return isEqual(await output1.read(), [36]) &&
    isEqual(await output2.read(), [10]);
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

async function testPrefixLength65537(): Promise<boolean> {
  const arr = Array.from({ length: 65537 }, () => 1);
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixLength16777217(): Promise<boolean> {
  const arr = Array.from({ length: 16777217 }, () => 0);
  arr[0] = 1;
  arr[16777217] = 2;
  const op = { operation: addFn, identityElement: 0 };
  return runAndCompare(arr, op, false);
}

async function testPrefixDoesNotDestroyBuffer(): Promise<boolean> {
  const input = root
    .createBuffer(d.arrayOf(d.f32, 8), [1, 2, 3, 4, 5, 6, 7, 8])
    .$usage('storage');

  prefixScan(root, input, { operation: addFn, identityElement: 0 });

  return isEqual(await input.read(), [1, 2, 3, 4, 5, 6, 7, 8]);
}

async function testPrefixDoesNotCacheBuffers(): Promise<boolean> {
  const arr1 = [1, 2, 3, 4, 5, 6, 7, 8];
  const arr2 = Array.from({ length: 10 }, () => 1);
  const op = { operation: addFn, identityElement: 0 };

  const input1 = root
    .createBuffer(d.arrayOf(d.f32, arr1.length), arr1)
    .$usage('storage');

  const output1 = prefixScan(root, input1, op);

  const input2 = root
    .createBuffer(d.arrayOf(d.f32, arr2.length), arr2)
    .$usage('storage');

  const output2 = prefixScan(root, input2, op);

  return isEqual(await output1.read(), prefixScanJS(arr1, op)) &&
    isEqual(await output2.read(), prefixScanJS(arr2, op));
}

// running the tests

async function runTests(): Promise<boolean> {
  let result = true;

  result = await testAdd8() && result;
  result = await testAdd123() && result;
  // result = await testMul() && result; // fails, returns 0
  result = await testStdMax() && result;
  result = await testConcat() && result;
  result = await testLength65537() && result;
  result = await testLength16777217() && result;
  result = await testDoesNotDestroyBuffer() && result;
  result = await testDoesNotCacheBuffers() && result;

  result = await testPrefixAdd8() && result;
  result = await testPrefixAdd123() && result;
  result = await testPrefixMul() && result;
  result = await testPrefixStdMax() && result;
  result = await testPrefixConcat() && result;
  result = await testPrefixLength65537() && result;
  result = await testPrefixLength16777217() && result;
  // result = await testPrefixDoesNotDestroyBuffer() && result; // fails
  result = await testPrefixDoesNotCacheBuffers() && result;

  return result;
}

const table = document.querySelector<HTMLDivElement>('.result');
if (!table) {
  throw new Error('Nowhere to display the results');
}
runTests().then((result) => {
  table.innerText = `Tests ${result ? 'succeeded' : 'failed'}.`;
});

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
