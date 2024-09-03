/*
{
  "title": "Increment (TGSL)",
  "category": "simple"
}
*/

import { addElement } from '@typegpu/example-toolkit';
import { vec2f } from 'typegpu/data';
import { tgpu } from 'typegpu/experimental';

// ---
addElement('button', {
  label: 'Increment',
  onClick: async () => {
    const result = await doIncrement();
    table.setMatrix([[result.x, result.y]]);
  },
});

const table = await addElement('table', {
  label: 'I am incremented on the GPU!',
});
table.setMatrix([[0]]);
// ---

const counterBuffer = tgpu.buffer(vec2f, vec2f(0, 1)).$allowMutable();
const counter = asMutable(counterBuffer);

const increment = tgpu
  .procedure(() => {
    const tmp = counter.value.x;
    counter.value.x = counter.value.y;
    counter.value.y += tmp;
  })
  .$uses({ counter });

const runtime = await createRuntime();

async function doIncrement() {
  runtime.compute(increment);
  return await runtime.readBuffer(counterBuffer);
}