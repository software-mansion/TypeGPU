import tgpu, { d } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
// Allocating memory for the counter
const counter = root.createMutable(d.u32);

// A 0-dimensional compute pipeline
const incrementPipeline = root.createGuardedComputePipeline(() => {
  'use gpu';
  counter.$ += 1;
});

const test = Array.from({ length: 16 }, (_, i) => i);
test[22]++;
console.log(test);

async function increment() {
  // Dispatch and read the result
  incrementPipeline.dispatchThreads();
  return await counter.read();
}

// #region Example controls & Cleanup

const table = document.querySelector('.counter') as HTMLDivElement;
export const controls = defineControls({
  Increment: {
    onButtonClick: async () => {
      table.innerText = `${await increment()}`;
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
