/*
{
  "title": "Increment (TGSL)",
  "category": "simple"
}
*/

import { addElement } from '@typegpu/example-toolkit';
import { createRuntime, tgpu } from 'typegpu';
import { u32 } from 'typegpu/data';

// ---
addElement('button', {
  label: 'Increment',
  onClick: async () => {
    table.setMatrix([[await doIncrement()]]);
  },
});

const table = await addElement('table', {
  label: 'I am incremented on the GPU!',
});
table.setMatrix([[0]]);
// ---

const countBuffer = tgpu.buffer(u32, 0).$allowMutable();
const count = countBuffer.asMutable();

const increment = tgpu
  .proc(() => {
    count.value += 1;
  })
  .$uses({ count });

const runtime = await createRuntime();

async function doIncrement() {
  runtime.compute(increment);
  return await runtime.readBuffer(countBuffer);
}
