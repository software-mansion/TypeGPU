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
  .procedure(() => {
    const tmp = counter.value.x;
    counter.value.x = counter.value.y;
    counter.value.y += tmp;
  })
  .$uses({ counter });

async function doIncrement() {
  // @ts-expect-error
  root.compute(increment);
  return await counterBuffer.read();
}

/** @button "Increment" */
export async function click() {
  const result = await doIncrement();
  table.innerText = `${result.x} ${result.y}`;
}
