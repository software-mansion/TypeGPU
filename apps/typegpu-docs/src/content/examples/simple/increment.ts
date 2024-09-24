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
import tgpu, { asMutable, wgsl } from 'typegpu/experimental';

const root = await tgpu.init();

const counterBuffer = root
  .createBuffer(u32, 0)
  .$name('counter')
  .$usage(tgpu.Storage);

const pipeline = root.makeComputePipeline({
  code: wgsl`${asMutable(counterBuffer)} += 1;`,
});

async function increment() {
  pipeline.execute();
  table.setMatrix([[await counterBuffer.read()]]);
}

addElement('button', {
  label: 'Increment',
  onClick: increment,
});

const table = await addElement('table', {
  label: 'I am incremented on the GPU!',
});
table.setMatrix([[0]]);
