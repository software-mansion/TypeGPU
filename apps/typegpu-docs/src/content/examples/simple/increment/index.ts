import { u32 } from 'typegpu/data';
import tgpu, { asMutable, wgsl } from 'typegpu/experimental';

const root = await tgpu.init();

const counterBuffer = root
  .createBuffer(u32, 0)
  .$name('counter')
  .$usage('storage');

const pipeline = root.makeComputePipeline({
  code: wgsl`${asMutable(counterBuffer)} += 1;`,
});

const table = document.querySelector('.counter') as HTMLDivElement;

/** @button "Increment" */
export async function increment() {
  pipeline.execute();
  const result = await counterBuffer.read();
  table.innerText = `${result}`;
}
