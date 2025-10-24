import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
// Allocating memory for the counter
const counter = root.createMutable(d.u32);

// A 0-dimentional shader function
const incrementKernel = prepareDispatch(root, () => {
  'kernel';
  counter.$ += 1;
});

async function increment() {
  // Dispatch and read the result
  incrementKernel.dispatch();
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
