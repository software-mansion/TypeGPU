import tgpu from 'typegpu';
import * as d from 'typegpu/data';
// import * as std from 'typegpu/std';
import { logicalExpressionTests } from './logical-expressions.ts';

const root = await tgpu.init();
const result = root['~unstable'].createMutable(d.i32, 0);

const f = tgpu['~unstable'].fn({})(() => {
  const a = d.mat2x2f(1, 2, 3, 4).mul(2);
});
console.log(tgpu.resolve({ externals: { f } }));
console.log(d.mat2x2f(1, 2, 3, 4).mul(2));
console.log(d.vec2f(1, 4).mul(2));

const computeRunTests = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
  () => {
    let s = true;

    s = s && logicalExpressionTests();

    if (s) {
      result.value = 1;
    } else {
      result.value = 0;
    }
  },
);

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
