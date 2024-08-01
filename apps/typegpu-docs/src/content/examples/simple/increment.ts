/*
{
  "title": "Increment",
  "category": "simple"
}
*/

// -- Hooks into the example environment
import { addElement } from '@typegpu/example-toolkit';
// --

import { createRuntime, wgsl } from 'typegpu';
import { u32 } from 'typegpu/data';

const counterBuffer = wgsl
  .buffer(u32, 0)
  .$name('counter')
  .$allowMutableStorage();

const runtime = await createRuntime();
const pipeline = runtime.makeComputePipeline({
  code: wgsl`${counterBuffer.asMutableStorage()} += 1;`,
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
