import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const computeLayout = tgpu.bindGroupLayout({
  current: { storageTexture: d.textureStorage2d('r32uint', 'read-only') },
  next: { storageTexture: d.textureStorage2d('r32uint') },
});

export const displayLayout = tgpu.bindGroupLayout({
  source: { storageTexture: d.textureStorage2d('r32uint', 'read-only') },
});

export const TILE_SIZE = 16;

export const gameSizeAccessor = tgpu['~unstable'].accessor(d.u32);

export const loadTexAt = (pos: d.v2u) => {
  'use gpu';
  return std.textureLoad(computeLayout.$.current, pos).x;
};
