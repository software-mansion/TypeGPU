import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d } from '@typegpu/noise';

const root = await tgpu.init();

const SIZE = 10;

const terrainTexture = root['~unstable'].createTexture({
  size: [SIZE, SIZE, SIZE],
  format: 'rgba16float',
  dimension: '3d',
}).$usage('sampled', 'render', 'storage');

const bindGroupLayout = tgpu.bindGroupLayout({
  terrain: { storageTexture: d.textureStorage3d('rgba16float', 'write-only') },
});

const bindGroup = root.createBindGroup(bindGroupLayout, {
  terrain: terrainTexture.createView(
    d.textureStorage3d('rgba16float', 'write-only'),
  ),
});

prepareDispatch(root, (x, y, z) => {
  'kernel';
  const level = perlin3d.sample(d.vec3f(x, y, z).div(SIZE));
  std.textureStore(
    bindGroupLayout.$.terrain,
    d.vec3u(x, y, z),
    d.vec4f(level, 0, 0, 0),
  );
})
  .with(bindGroupLayout, bindGroup)
  .dispatch(SIZE, SIZE, SIZE);

// Example controls and cleanup

export function onCleanup() {
  root.destroy();
}
