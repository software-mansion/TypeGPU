import tgpu, { unstable_asMutable } from 'typegpu';
import * as d from 'typegpu/data';

const table = document.querySelector('.counter') as HTMLDivElement;

const root = await tgpu.init();

const counterBuffer = root
  .createBuffer(d.vec2f, d.vec2f(0, 1))
  .$usage('storage');
const counter = unstable_asMutable(counterBuffer);

const increment = tgpu['~unstable']
  .computeFn({}, { workgroupSize: [1] })
  .does(() => {
    const tmp = counter.value.x;
    counter.value.x = counter.value.y;
    counter.value.y += tmp;
  });

const pipeline = root['~unstable'].withCompute(increment).createPipeline();

async function doIncrement() {
  pipeline.dispatchWorkgroups(1);
  return await counterBuffer.read();
}

export const controls = {
  Increment: {
    onButtonClick: async () => {
      const result = await doIncrement();
      table.innerText = `${result.x} ${result.y}`;
    },
  },
};

export function onCleanup() {
  root.destroy();
}
