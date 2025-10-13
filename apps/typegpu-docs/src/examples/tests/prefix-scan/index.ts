import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import { prefixScan, scan } from '@typegpu/concurrent-scan';
import * as std from 'typegpu/std';
import { addFn } from './functions';

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
    .createBuffer(d.arrayOf(d.f32, 8), [10, 11, 12, 13, 14, 15, 16, 17])
    .$usage('storage');

  const output = scan(root, input, {
    operation: addFn,
    identityElement: 0,
  });

  return isEqual(
    await output.read(),
    [108],
  );
}

// prefix tests

// running the tests

async function runTests(): Promise<boolean> {
  let result = true;
  result = await testAdd8() && result;
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
