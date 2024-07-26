/*
{
  "title": "Increment",
  "category": "simple"
}
*/

import wgsl from 'wigsill';
import { f32 } from 'wigsill/data';
import { createRuntime } from 'wigsill/web';

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
  console.log(await runtime.readBuffer(countBuffer));
}

increment();
