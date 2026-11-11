// perlin2d.cache and perlin3d.cache precompiled, instantiated on the pruned root
import { d } from 'typegpu';
import { perlin2d, perlin3d } from '@typegpu/noise';
import { init, precompile } from '@typegpu/prune';

const define = precompile((root) => ({
  perlin2d: perlin2d.cache.define(root, {}),
  perlin3d: perlin3d.cache.define(root, {}),
  // The io takes vectors, which can't be made without TypeGPU at runtime
  size2d: d.vec2u(16, 8),
  size3d: d.vec3u(8, 4, 2),
}));

const root = await init();
const definition = define(root);

const instances = [
  perlin2d.cache.instantiate(root, definition.perlin2d, { size: definition.size2d }),
  perlin3d.cache.instantiate(root, definition.perlin3d, { size: definition.size3d }),
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
