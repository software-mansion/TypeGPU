/*
{
  "title": "Increment",
  "category": "simple",
  "tags": ["experimental"]
}
*/

// -- Hooks into the example environment
import { addElement } from '@typegpu/example-toolkit';
// --

import { u32 } from 'typegpu/data';
import tgpu, { asMutable, createRuntime, wgsl } from 'typegpu/experimental';

const counterBuffer = tgpu
  .createBuffer(u32, 0)
  .$name('counter')
  .$usage(tgpu.Storage);

const runtime = await createRuntime();
const pipeline = runtime.makeComputePipeline({
  code: wgsl`${asMutable(counterBuffer)} += 1;`,
});

async function increment() {
  pipeline.execute();
  table.setMatrix([[await runtime.readBuffer(counterBuffer)]]);
}

addElement('button', {
  label: 'Increment',
  onClick: increment,
});

const table = await addElement('table', {
  label: 'I am incremented on the GPU!',
});
table.setMatrix([[0]]);
