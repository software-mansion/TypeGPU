import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
// Allocating memory for the counter
const counter = root.createMutable(d.u32);

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

// import { type TgpuRoot } from 'typegpu';
// import { arrayOf } from 'typegpu/data';

// export function createInstanceBuffer<StructData extends d.WgslStruct>(
//   root: TgpuRoot,
//   struct: StructData,
//   length: number,
// ) {
//   const hello = d.arrayOf(struct, length);
//   const instanceBuffer = root
//     .createBuffer(struct)
//     .$usage('vertex', 'storage');

//   const instanceLayout = tgpu.vertexLayout(
//     (n) => arrayOf(struct, n),
//     'instance',
//   );
//   return [instanceBuffer, instanceLayout] as const;
// }
