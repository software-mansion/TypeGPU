import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
// Allocating memory for the counter
const counter = root.createMutable(d.u32);

const f = (v: number) => {
  'use gpu';
  return v;
};

// A 0-dimensional compute pipeline
const incrementPipeline = root['~unstable'].createGuardedComputePipeline(() => {
  'use gpu';
  let x = 1;
  x ||= 2;
  console.log(x);
  counter.$ += 1;
});

console.log(tgpu.resolve([incrementPipeline.pipeline]));

async function increment() {
  // Dispatch and read the result
  incrementPipeline.dispatchThreads();
  return await counter.read();
}

// #region Example controls & Cleanup

const table = document.querySelector('.counter') as HTMLDivElement;
export const controls = {
  Increment: {
    onButtonClick: async () => {
      table.innerText = `${await increment()}`;
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
