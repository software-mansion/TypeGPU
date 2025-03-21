import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { booleanTests } from './boolean';

const root = await tgpu.init();

const resultBuffer = root.createBuffer(d.i32, 0).$usage('storage');
const result = resultBuffer.as('mutable');

const computeRunTests = tgpu['~unstable']
  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })
  .does(() => {
    let s = true;
    s = s && booleanTests();

    if (s) {
      result.value = 1;
    } else {
      result.value = 0;
    }
  });

const pipeline = root['~unstable']
  .withCompute(computeRunTests)
  .createPipeline();

async function runTests() {
  pipeline.dispatchWorkgroups(1);
  return await resultBuffer.read();
}

// #region Example controls and cleanup

export const controls = {
  'Run tests': {
    onButtonClick: async () => {
      const result = await runTests();
      const table = document.querySelector('.result') as HTMLDivElement;
      table.innerText = result === 0 ? 'Tests failed.' : 'Tests succeeded!';
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
