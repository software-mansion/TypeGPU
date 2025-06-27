import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const table = document.querySelector('.counter') as HTMLDivElement;

const root = await tgpu.init();

const counter = root.createMutable(d.vec3f, d.vec3f(0, 1, 0));

const increment = tgpu['~unstable'].computeFn({
  in: { num: d.builtin.numWorkgroups },
  workgroupSize: [1],
})((input) => {
  const tmp = counter.$.x;
  counter.$.x = counter.$.y;
  counter.$.y += tmp;
  counter.$.z += d.f32(input.num.x);
});

const pipeline = root['~unstable'].withCompute(increment).createPipeline();

async function doIncrement() {
  pipeline.dispatchWorkgroups(1);
  return await counter.read();
}

export const controls = {
  Increment: {
    onButtonClick: async () => {
      const result = await doIncrement();
      table.innerText = `${result.x} ${result.y} ${result.z}`;
    },
  },
};

export function onCleanup() {
  root.destroy();
}
