import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { logicalExpressionTests } from './logical-expressions.ts';

const root = await tgpu.init();
const result = root['~unstable'].createMutable(d.i32, 0);

const computeRunTests = tgpu['~unstable']
  .computeFn({ workgroupSize: [1] })(() => {
    let s = true;
    s = s && logicalExpressionTests();

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
  return await result.buffer.read();
}

// #region Example controls and cleanup

export const controls = {
  'Run tests': {
    async onButtonClick() {
      const table = document.querySelector<HTMLDivElement>('.result');
      if (!table) {
        throw new Error('Nowhere to display the results');
      }
      table.innerText = (await runTests())
        ? 'Tests succeeded!'
        : 'Tests failed.';
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
