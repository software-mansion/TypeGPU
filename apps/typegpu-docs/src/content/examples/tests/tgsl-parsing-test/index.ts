import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { arrayAndStructConstructorsTest } from './array-and-struct-constructors.ts';
import { infixOperatorsTests } from './infix-operators.ts';
import { logicalExpressionTests } from './logical-expressions.ts';
import { matrixOpsTests } from './matrix-ops.ts';
import { pointersTest } from './pointers.ts';

const root = await tgpu.init();
const result = root.createMutable(d.i32, 0);

const computeRunTests = tgpu['~unstable']
  .computeFn({ workgroupSize: [1] })(() => {
    let s = true;
    s = s && logicalExpressionTests();
    s = s && matrixOpsTests();
    s = s && infixOperatorsTests();
    s = s && arrayAndStructConstructorsTest();
    s = s && pointersTest();

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
  return await result.read();
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
  'Log resolved pipeline': {
    async onButtonClick() {
      console.log(tgpu.resolve({ externals: { pipeline } }));
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
