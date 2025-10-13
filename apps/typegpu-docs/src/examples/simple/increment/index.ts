import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
const offset = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));
// Allocating memory for the counter
const counter = root.createMutable(d.f32);

const foo = tgpu.fn([])(() => {
  const off = offset.$;
  counter.$ += off.x;
});

// A 0-dimentional shader function
const gpuIncrement = prepareDispatch(root, () => {
  'use gpu';
  foo();
});

async function increment() {
  // Dispatch and read the result
  gpuIncrement.dispatch();
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
