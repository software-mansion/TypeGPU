/*
{
  "title": "Increment (TGSL)",
  "category": "simple",
  "tags": ["experimental"]
}
*/

import { addElement } from '@typegpu/example-toolkit';
import { JitTranspiler } from '@typegpu/jit';
import { vec2f } from 'typegpu/data';
import tgpu, { asMutable } from 'typegpu/experimental';

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

const root = await tgpu.init({
  jitTranspiler: new JitTranspiler(),
});

const counterBuffer = root.createBuffer(vec2f, vec2f(0, 1)).$usage('storage');
const counter = asMutable(counterBuffer);

const increment = tgpu
  .procedure(() => {
    const tmp = counter.value.x;
    counter.value.x = counter.value.y;
    counter.value.y += tmp;
  })
  .$uses({ counter });

async function doIncrement() {
  // @ts-expect-error
  root.compute(increment);
  return await counterBuffer.read();
}
