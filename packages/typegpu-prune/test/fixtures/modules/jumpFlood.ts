// jumpFlood precompiled, instantiated on the pruned root, with its own outputs and with
// borrowed ones, reading a source texture through an extra bind group
import { d, std, tgpu } from 'typegpu';
import { jumpFlood } from '@typegpu/sdf';
import { init, precompile } from '@typegpu/prune';

const define = precompile((root) => {
  const sourceLayout = tgpu.bindGroupLayout({ source: { texture: d.texture2d() } });
  return {
    sourceLayout,
    flood: jumpFlood.define(root, {
      classify: (coord) => {
        'use gpu';
        return std.textureLoad(sourceLayout.$.source, coord, 0).w > 0.5;
      },
      getSdf: (_coord, size, signedDist) => {
        'use gpu';
        return signedDist / d.f32(std.min(size.x, size.y));
      },
      getColor: (_coord, _size, _signedDist, insidePx) => {
        'use gpu';
        return d.vec4f(std.textureLoad(sourceLayout.$.source, insidePx, 0).xyz, 1);
      },
    }),
  };
});

const root = await init();
const definition = define(root);

const source = root.createTexture({ size: [64, 32], format: 'rgba8unorm' }).$usage('sampled');
const bindGroups = [root.createBindGroup(definition.sourceLayout, { source: source.createView() })];

const instances = [
  jumpFlood.instantiate(root, definition.flood, { size: { width: 64, height: 32 }, bindGroups }),
  jumpFlood.instantiate(root, definition.flood, {
    size: { width: 20, height: 20 },
    bindGroups,
    sdfOutput: root
      .createTexture({ size: [20, 20], format: 'rgba16float' })
      .$usage('storage', 'sampled'),
    colorOutput: root
      .createTexture({ size: [20, 20], format: 'rgba8unorm' })
      .$usage('storage', 'sampled'),
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
source.destroy();
