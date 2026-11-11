// prefixScan precompiled, instantiated on the pruned root: a multi-level scan and a reduction.
// The one-shot `prefixScan.scan`/`reduce` helpers define at runtime, so they aren't covered
import { d, std } from 'typegpu';
import { prefixScan } from '@typegpu/algorithm';
import { init, precompile } from '@typegpu/prune';

// The definition has no schema of the scanned buffer, so the app precompiles its own
const defineScan = precompile((root) => ({
  Data: d.arrayOf(d.f32),
  scan: prefixScan.define(root, { elementType: d.f32, operation: std.add, identityElement: 0 }),
}));
const defineReduce = precompile((root) => ({
  Data: d.arrayOf(d.u32),
  scan: prefixScan.define(root, {
    elementType: d.u32,
    reduceOnly: true,
    operation: std.max,
    identityElement: 0,
  }),
}));

const root = await init();
const scan = defineScan(root);
const reduce = defineReduce(root);

const instances = [
  prefixScan.instantiate(root, scan.scan, {
    buffer: root
      .createBuffer(
        scan.Data(10000),
        Array.from({ length: 10000 }, (_, i) => i % 10),
      )
      .$usage('storage'),
  }),
  prefixScan.instantiate(root, reduce.scan, {
    buffer: root
      .createBuffer(
        reduce.Data(700),
        Array.from({ length: 700 }, (_, i) => (i * 31) % 700),
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
