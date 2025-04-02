import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const table = document.querySelector('.counter') as HTMLDivElement;

const root = await tgpu.init();

const counterBuffer = root
  .createBuffer(d.vec3f, d.vec3f(0, 1, 0))
  .$usage('storage');
const counter = counterBuffer.as('mutable');

const increment = tgpu['~unstable'].computeFn({
  in: { num: d.builtin.numWorkgroups },
  workgroupSize: [1],
})((input) => {
  const tmp = counter.value.x;
  counter.value.x = counter.value.y;
  counter.value.y += tmp;
  counter.value.z += d.f32(input.num.x);
});

const addJs = ({ x, y }: { x: number; y: number }) => {
  'kernel & js';
  return x + y;
};

const add = tgpu['~unstable'].fn({ x: d.u32, y: d.u32 })(addJs);

console.log(addJs({ x: 2, y: 3 }));

console.log(tgpu.resolve({ externals: { add } }));

const pipeline = root['~unstable'].withCompute(increment).createPipeline();

async function doIncrement() {
  pipeline.dispatchWorkgroups(1);
  return await counterBuffer.read();
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
