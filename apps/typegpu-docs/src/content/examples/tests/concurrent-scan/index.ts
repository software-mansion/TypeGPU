// irrelevant import so the file becomes a module
import { prefixScan } from '@typegpu/concurrent-scan';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// setup
const root = await tgpu.init({
  device: {
    requiredFeatures: [
      'timestamp-query',
    ],
  },
});
const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
if (!device) {
  throw new Error('WebGPU is not supported!');
}

// --- test 0: concat ---

/**
 * Concats two numbers. Loses precision when the result has more than 7 digits.
 * @example
 * concat(123, 456); // 123456
 */
const concat10 = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
  if (a === 0) return b;
  if (b === 0) return a;
  if (b === 1) return a * 10 + b;
  const digits = std.ceil(std.log(b) / std.log(10));
  const result = std.pow(10, digits) * a + b;
  const roundedResult = std.ceil(result - 0.4);
  return roundedResult;
});

const buffer = root
  .createBuffer(d.arrayOf(d.f32, 16), [
    0,
    0,
    1,
    0,
    2,
    0,
    3,
    0,
    4,
    0,
    5,
    6,
    0,
    0,
    7,
    0,
  ])
  .$usage('storage');
const result = prefixScan(root, buffer, {
  identityElement: 0,
  operation: concat10,
});
await root.device.queue.onSubmittedWorkDone();

const resultString = await result.read();
const resultMessage = resultString.toString() ===
    '0,0,0,1,1,12,12,123,123,1234,1234,12345,123456,123456,123456,1234567'
  ? 'Test passed! The result is correct.'
  : 'Test failed! The result is incorrect.';
console.log('Result:', resultString);

const resultDiv = document.getElementById('result');
if (!resultDiv) throw new Error('No result div found');
resultDiv.textContent = resultMessage;
resultDiv.style.color = resultMessage.includes('passed') ? 'green' : 'red';

// --- test 1: sum (exclusive prefix sum) ---
const sumBuffer = root.createBuffer(d.arrayOf(d.f32, 4), [1, 2, 3, 4]).$usage(
  'storage',
);
const sumResult = prefixScan(root, sumBuffer, {
  identityElement: 0,
  operation: std.add,
});
await root.device.queue.onSubmittedWorkDone();

const sumString = (await sumResult.read()).toString();
const sumMessage = sumString === '0,1,3,6'
  ? 'Test passed! The result is correct.'
  : 'Test failed! The result is incorrect.';
console.log('Sum Result:', sumString);
const sumDiv = document.getElementById('result-sum');
if (sumDiv) {
  sumDiv.textContent = sumMessage;
  sumDiv.style.color = sumMessage.includes('passed') ? 'green' : 'red';
}

// --- test 2 - std.max ---
const maxFn = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => std.max(a, b));
const maxBuffer = root.createBuffer(d.arrayOf(d.f32, 4), [2, 5, 1, 4]).$usage(
  'storage',
);
const maxResult = prefixScan(root, maxBuffer, {
  identityElement: 0,
  operation: maxFn,
});
await root.device.queue.onSubmittedWorkDone();
const maxString = (await maxResult.read()).toString();
const maxMessage = maxString === '0,2,5,5'
  ? 'Test passed! The result is correct.'
  : 'Test failed! The result is incorrect.';
console.log('Max Result:', maxString);
const maxDiv = document.getElementById('result-max');
if (maxDiv) {
  maxDiv.textContent = maxMessage;
  maxDiv.style.color = maxMessage.includes('passed') ? 'green' : 'red';
}
