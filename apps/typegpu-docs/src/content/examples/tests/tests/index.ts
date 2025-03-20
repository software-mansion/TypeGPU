import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const table = document.querySelector('.result') as HTMLDivElement;

const root = await tgpu.init();

const resultBuffer = root.createBuffer(d.i32, 0).$usage('storage');
const result = resultBuffer.as('mutable');

const increment = tgpu['~unstable']
  .computeFn({ in: { num: d.builtin.numWorkgroups }, workgroupSize: [1] })
  .does(() => {
    result.value = 1;
  });

const pipeline = root['~unstable'].withCompute(increment).createPipeline();

async function runTests() {
  pipeline.dispatchWorkgroups(1);
  return await resultBuffer.read();
}

// #region Example controls and cleanup

export const controls = {
  'Run tests': {
    onButtonClick: async () => {
      const result = await runTests();
      table.innerText = result === 0 ? 'Tests failed.' : 'Tests succeeded!';
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
