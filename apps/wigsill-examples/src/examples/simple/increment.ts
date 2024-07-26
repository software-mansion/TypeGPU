/*
{
  "title": "Increment",
  "category": "simple"
}
*/

import { addElement } from '@wigsill/example-toolkit';
import { createRuntime, f32, wgsl } from 'wigsill';

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
  pipeline.execute([1, 1]);
  runtime.flush();
  console.log(await countBuffer.read(runtime));
}

addElement('button', {
  label: 'Increment',
  onClick: increment,
});
