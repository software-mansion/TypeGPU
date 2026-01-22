import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const computeLayout = tgpu.bindGroupLayout({
  current: { texture: d.texture2d(d.u32) },
  next: { storageTexture: d.textureStorage2d('r32uint') },
  sampler: { sampler: 'non-filtering' },
});

// Bitpacked layout: each u32 stores 32 horizontal cells
// Texture size is (gameSize/32) x gameSize
export const bitpackedLayout = tgpu.bindGroupLayout({
  current: { texture: d.texture2d(d.u32) },
  next: { storageTexture: d.textureStorage2d('r32uint') },
  sampler: { sampler: 'non-filtering' },
});

export const displayLayout = tgpu.bindGroupLayout({
  source: { storageTexture: d.textureStorage2d('r32uint', 'read-only') },
});

// Display shader for bitpacked textures (unpacks bits)
export const bitpackedDisplayLayout = tgpu.bindGroupLayout({
  source: { storageTexture: d.textureStorage2d('r32uint', 'read-only') },
});

export const TILE_SIZE = 16;
export const BITS_PER_CELL = 32;

export const gameSizeAccessor = tgpu['~unstable'].accessor(d.u32);

export const loadTexAt = (pos: d.v2u) => {
  'use gpu';
  return std.textureLoad(computeLayout.$.current, pos, d.i32(0)).x;
};
