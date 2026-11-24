// The radiance cascades SDF runner precompiled, instantiated on the pruned root, in both merge
// modes, writing to its own output and to a borrowed one
import { d, std } from 'typegpu';
import * as rc from '@typegpu/radiance-cascades';
import { init, precompile } from '@typegpu/prune';

const define = precompile((root) => {
  const options = {
    sdf: (uv: d.v2f) => {
      'use gpu';
      return std.length(uv - 0.5) - 0.1;
    },
    emission: () => {
      'use gpu';
      return d.vec3f(1);
    },
  };
  return {
    hardware: rc.define(root, { ...options, mergeMode: 'hardware' }),
    bilinearFix: rc.define(root, { ...options, mergeMode: 'bilinear-fix' }),
  };
});

const root = await init();
const definition = define(root);

const output = root
  .createTexture({ size: [32, 32], format: 'rgba16float' })
  .$usage('storage', 'sampled');

const instances = [
  rc.instantiate(root, definition.hardware, {
    size: { width: 64, height: 32 },
    sdfResolution: { width: 64, height: 32 },
  }),
  rc.instantiate(root, definition.bilinearFix, {
    output,
    sdfResolution: { width: 128, height: 128 },
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
output.destroy();
