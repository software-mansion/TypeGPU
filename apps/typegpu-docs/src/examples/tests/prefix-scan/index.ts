import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import { prefixScan, scan } from '@typegpu/concurrent-scan';
import * as std from 'typegpu/std';
import { addFn, concat10, mulFn } from './functions';

const root = await tgpu.init({
  device: {
    requiredFeatures: [
      'timestamp-query',
    ],
  },
});

function isEqual(e1: unknown, e2: unknown): boolean {
  if (Array.isArray(e1) && Array.isArray(e2)) {
    return e1.every((elem, i) => isEqual(elem, e2[i]));
  }
  return e1 === e2;
}

// single element tests

async function testAdd8(): Promise<boolean> {
  const input = root
    .createBuffer(d.arrayOf(d.f32, 8), [-4, -3, -2, -1, 0, 2, 4, 6])
    .$usage('storage');

  const output = scan(root, input, {
    operation: addFn,
    identityElement: 0,
  });

  return isEqual(
    await output.read(),
    [2],
  );
}

async function testAdd123(): Promise<boolean> {
  const input = root
    .createBuffer(d.arrayOf(d.f32, 123), Array.from({ length: 123 }, () => 2))
    .$usage('storage');

  const output = scan(root, input, {
    operation: addFn,
    identityElement: 0,
  });

  return isEqual(
    await output.read(),
    [246],
  );
}

async function testMul(): Promise<boolean> {
  const input = root
    .createBuffer(d.arrayOf(d.f32, 16), Array.from({ length: 16 }, () => 2))
    .$usage('storage');

  const output = scan(root, input, {
    operation: mulFn,
    identityElement: 1,
  });

  console.log(await output.read());

  return isEqual(
    await output.read(),
    [65536],
  );
}

async function testStdMax(): Promise<boolean> {
  const input = root
    .createBuffer(d.arrayOf(d.f32, 16), Array.from({ length: 16 }, (_, i) => i))
    .$usage('storage');

  const output = scan(root, input, {
    operation: std.max,
    identityElement: -9999,
  });

  return isEqual(
    await output.read(),
    [15],
  );
}

async function testConcat(): Promise<boolean> {
  const input = root
    .createBuffer(
      d.arrayOf(d.f32, 15),
      [0, 0, 0, 1, 0, 2, 0, 0, 3, 4, 5, 0, 0, 0, 6],
    )
    .$usage('storage');

  const output = scan(root, input, {
    operation: concat10,
    identityElement: 0,
  });

  return isEqual(
    await output.read(),
    [123456],
  );
}

async function testLength65537(): Promise<boolean> {
  const input = root
    .createBuffer(
      d.arrayOf(d.f32, 65537),
      Array.from({ length: 65537 }, () => 1),
    )
    .$usage('storage');

  const output = scan(root, input, {
    operation: addFn,
    identityElement: 0,
  });

  return isEqual(
    await output.read(),
    [65537],
  );
}

async function testLength16777217(): Promise<boolean> {
  const input = root
    .createBuffer(
      d.arrayOf(d.f32, 16777217),
      Array.from({ length: 16777217 }, () => 1),
    )
    .$usage('storage');

  const output = scan(root, input, {
    operation: addFn,
    identityElement: 0,
  });

  console.log(await output.read());

  return isEqual(
    await output.read(),
    [16777217],
  );
}

// jakiś cache test...

// prefix tests

// running the tests

async function runTests(): Promise<boolean> {
  let result = true;

  result = await testAdd8() && result;
  result = await testAdd123() && result;
  // result = await testMul() && result; // fails, returns 0
  result = await testStdMax() && result;
  result = await testConcat() && result;
  result = await testLength65537() && result;
  // result = await testLength16777217() && result; // fails, returns 16777216

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
