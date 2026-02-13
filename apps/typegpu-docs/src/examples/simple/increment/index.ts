import tgpu, { d } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
// Allocating memory for the counter
const counter = root.createMutable(d.u32);

const A = d.vec2f(1, 2);
const B = d.vec2f(3, 4);

const foo = () => {
  'use gpu';
  const C = A + B;
  counter.$ += 1;
};
console.log(tgpu.resolve([foo]));

// A 0-dimensional compute pipeline
const incrementPipeline = root['~unstable'].createGuardedComputePipeline(() => {
  'use gpu';
  counter.$ += 1;
});

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
