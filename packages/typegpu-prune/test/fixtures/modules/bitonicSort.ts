// bitonicSort precompiled, instantiated on the pruned root: dense and padded sizes, with and
// without values, small enough for global steps only and big enough for the local kernels
import { d } from 'typegpu';
import { bitonicSort } from '@typegpu/algorithm';
import { init, precompile } from '@typegpu/prune';

const defineKeys = precompile((root) => bitonicSort.define(root, { keyType: d.u32 }));
const defineWithValues = precompile((root) =>
  bitonicSort.define(root, { keyType: d.f32, valueType: d.u32 }),
);

const root = await init();
const keysOnly = defineKeys(root);
const withValues = defineWithValues(root);
const { valueArray } = withValues;
if (!valueArray) {
  throw new Error('A definition with a valueType has a valueArray');
}

const keys = (size: number) =>
  root
    .createBuffer(
      keysOnly.keyArray(size),
      Array.from({ length: size }, (_, i) => (i * 7919) % size),
    )
    .$usage('storage');

const instances = [
  // Dense, global steps only
  bitonicSort.instantiate(root, keysOnly, { keys: keys(256) }),
  // Padded, local kernels
  bitonicSort.instantiate(root, keysOnly, { keys: keys(1000) }),
  // Dense, local kernels, with values
  bitonicSort.instantiate(root, withValues, {
    keys: root
      .createBuffer(
        withValues.keyArray(1024),
        Array.from({ length: 1024 }, (_, i) => Math.sin(i)),
      )
      .$usage('storage'),
    values: root
      .createBuffer(
        valueArray(1024),
        Array.from({ length: 1024 }, (_, i) => i),
      )
      .$usage('storage'),
  }),
  // Padded, global steps only, with values
  bitonicSort.instantiate(root, withValues, {
    keys: root.createBuffer(withValues.keyArray(100)).$usage('storage'),
    values: root.createBuffer(valueArray(100)).$usage('storage'),
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
