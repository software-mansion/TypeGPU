/*
{
  "title": "Increment",
  "category": "simple"
}
*/

// -- Hooks into the example environment
import { addElement } from '@wigsill/example-toolkit';
// --

import wgsl from 'wigsill';
import { f32 } from 'wigsill/data';
import { createRuntime } from 'wigsill/web';

const countBuffer = wgsl.buffer(f32).$allowMutableStorage();
const countData = countBuffer.asStorage();

const runtime = await createRuntime();
const pipeline = runtime.makeComputePipeline({
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
