/*
{
  "title": "Increment",
  "category": "simple"
}
*/

// -- Hooks into the example environment
import { addElement } from '@typegpu/example-toolkit';
// --

import wgsl from 'typegpu';
import { f32 } from 'typegpu/data';
import { createRuntime } from 'typegpu/web';

const countBuffer = wgsl.buffer(f32).$allowMutableStorage();
const countData = countBuffer.asStorage();

const runtime = await createRuntime();
const pipeline = runtime.makeComputePipeline({
  args: [],
  workgroupSize: [1, 1],
  code: wgsl`
    ${countData} = ${countData} + 1;
  `,
});

async function increment() {
  pipeline.execute({ workgroups: [1, 1] });
  runtime.flush();
  console.log(await runtime.readBuffer(countBuffer));
}

addElement('button', {
  label: 'Increment',
  onClick: increment,
});
