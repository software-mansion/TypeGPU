import { tgpu, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
// Allocating memory for the counter
const counter = root.createMutable(d.u32);

// A 0-dimensional compute pipeline
const incrementPipeline = root.createGuardedComputePipeline(() => {
  'use gpu';
  counter.$ += 1;
});

async function increment() {
  // Dispatch and read the result
  incrementPipeline.dispatchThreads();
  return await counter.read();
}

import { randf } from '@typegpu/noise';

const b = root.createMutable(d.f32);
const f = () => {
  'use gpu';
  b.$ = randf.sample();
};
// ---cut---
import {
  hash,
  randomGeneratorShell,
  randomGeneratorSlot,
  u32To01F32,
  type StatefulGenerator,
} from '@typegpu/noise';

const LCG32: StatefulGenerator = (() => {
  const seed = tgpu.privateVar(d.u32);

  const multiplier = tgpu.accessor(d.u32, 1664525);
  const increment = tgpu.accessor(d.u32, 1013904223);

  return {
    seed: tgpu.fn([d.f32])((value) => {
      seed.$ = hash(std.bitcastF32toU32(value));
    }),

    sample: randomGeneratorShell(() => {
      'use gpu';
      seed.$ = multiplier.$ * seed.$ + increment.$; // % 2 ^ 32
      return u32To01F32(seed.$);
    }).$name('sample'),
  };
})();

const pipeline = root.with(randomGeneratorSlot, LCG32).createGuardedComputePipeline(f);

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
