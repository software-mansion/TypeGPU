/*
{
  "title": "Tests 2",
  "category": "simple"
}
*/

import { typedDevice } from 'typegpu';
import { u32 } from 'typegpu/data';

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
  throw new Error('No adapter');
}
const device = typedDevice(await adapter.requestDevice());

const b = device.createBuffer({
  type: u32,
  usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});

const b2 = device.createBuffer({
  size: 4,
  usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(b, 321);
device.queue.writeBuffer(b2, 0, new Int32Array([123]));

const val = await device.readBuffer(b);
const val2 = await device.readBuffer(b2);

console.log(val);
console.log(new Int32Array(val2)[0]);
