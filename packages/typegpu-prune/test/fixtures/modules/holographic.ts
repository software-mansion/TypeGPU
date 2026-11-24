// The holographic radiance cascades runner precompiled, instantiated on the pruned root, with
// and without a source
import { d } from 'typegpu';
import * as hrc from '@typegpu/radiance-cascades/holographic';
import { init, precompile } from '@typegpu/prune';

const define = precompile((root) => {
  const medium = () => {
    'use gpu';
    return { emission: d.vec3f(0.1), extinction: 0.5 };
  };
  return {
    plain: hrc.define(root, { medium }),
    withSource: hrc.define(root, {
      medium,
      source: (_pixel, incident) => {
        'use gpu';
        return incident * 0.5;
      },
    }),
  };
});

const root = await init();
const definition = define(root);

const instances = [
  hrc.instantiate(root, definition.plain, { size: { width: 64, height: 32 } }),
  hrc.instantiate(root, definition.withSource, { size: { width: 32, height: 32 }, iterations: 2 }),
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
