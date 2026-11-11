// radixSort precompiled, instantiated on the pruned root: every key type, values, and sorting
// into separate output buffers
import { d } from 'typegpu';
import { radixSort } from '@typegpu/algorithm';
import { init, precompile } from '@typegpu/prune';

const defineU32 = precompile((root) =>
  radixSort.define(root, { keyType: d.u32, valueType: d.u32 }),
);
const defineI32 = precompile((root) =>
  radixSort.define(root, { keyType: d.i32, direction: 'descending' }),
);
const defineF32 = precompile((root) => radixSort.define(root, { keyType: d.f32 }));

const root = await init();
const u32 = defineU32(root);
const i32 = defineI32(root);
const f32 = defineF32(root);
const { valueArray } = u32;
if (!valueArray) {
  throw new Error('A definition with a valueType has a valueArray');
}

const size = 5000;
const data = Array.from({ length: size }, (_, i) => (i * 7919) % size);

const instances = [
  radixSort.instantiate(root, u32, {
    keys: root.createBuffer(u32.keyArray(size), data).$usage('storage'),
    values: root.createBuffer(valueArray(size), data).$usage('storage'),
    out: {
      keys: root.createBuffer(u32.keyArray(size)).$usage('storage'),
      values: root.createBuffer(valueArray(size)).$usage('storage'),
    },
  }),
  radixSort.instantiate(root, i32, {
    keys: root
      .createBuffer(
        i32.keyArray(300),
        data.slice(0, 300).map((x) => x - 150),
      )
      .$usage('storage'),
  }),
  radixSort.instantiate(root, f32, {
    keys: root
      .createBuffer(
        f32.keyArray(size),
        data.map((x) => x / 3),
      )
      .$usage('storage'),
  }),
];

const encoder = root.createCommandEncoder();
const pass = encoder.beginComputePass();
for (const instance of instances) {
  instance.step(pass);
}
pass.end();
encoder.submit();

for (const instance of instances) {
  instance.destroy();
}
