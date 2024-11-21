import { JitTranspiler } from '@typegpu/jit';
import { vec2f } from 'typegpu/data';
import tgpu, { asMutable } from 'typegpu/experimental';

const table = document.querySelector('.counter') as HTMLDivElement;

const root = await tgpu.init({
  unstable_jitTranspiler: new JitTranspiler(),
});

const counterBuffer = root.createBuffer(vec2f, vec2f(0, 1)).$usage('storage');
const counter = asMutable(counterBuffer);

const increment = tgpu
  .computeFn([1])
  .does(() => {
    const tmp = counter.value.x;
    counter.value.x = counter.value.y;
    counter.value.y += tmp;
  })
  .$uses({ counter });

const pipeline = root.withCompute(increment).createPipeline();

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
  root.device.destroy();
}
