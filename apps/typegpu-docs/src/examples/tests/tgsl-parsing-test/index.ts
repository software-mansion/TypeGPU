import tgpu, { d } from 'typegpu';
import { arrayAndStructConstructorsTest } from './array-and-struct-constructors.ts';
import { infixOperatorsTests } from './infix-operators.ts';
import { logicalExpressionTests } from './logical-expressions.ts';
import { matrixOpsTests } from './matrix-ops.ts';
import { pointersTest } from './pointers.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const result = root.createMutable(d.i32, 0);

const computeRunTests = tgpu.computeFn({ workgroupSize: [1] })(() => {
  let s = true;
  s = s && logicalExpressionTests();
  s = s && matrixOpsTests();
  s = s && infixOperatorsTests();
  s = s && arrayAndStructConstructorsTest();
  s = s && pointersTest();

  if (s) {
    result.$ = 1;
  } else {
    result.$ = 0;
  }
});

const pipeline = root.createComputePipeline({
  compute: computeRunTests,
});

async function runTests() {
  pipeline.dispatchWorkgroups(1);
  return await result.read();
}

const table = document.querySelector<HTMLDivElement>('.result');
if (!table) {
  throw new Error('Nowhere to display the results');
}
void runTests().then((result) => {
  table.innerText = `Tests ${result ? 'succeeded' : 'failed'}.`;
});

// #region Example controls and cleanup

export const controls = defineControls({
  'Log resolved pipeline': {
    async onButtonClick() {
      console.log(tgpu.resolve([pipeline]));
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
