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
  const output = await runtime.readBuffer(counterBuffer);
  console.log(output);
}

addElement('button', {
  label: 'Increment',
  onClick: increment,
});
