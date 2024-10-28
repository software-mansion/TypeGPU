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

/** @button "Increment" */
export function increment() {
  pipeline.execute();
  counterBuffer.read().then((value) => {
    table.innerText = `${value}`;
  });
}

const table = document.querySelector('.counter') as HTMLDivElement;
