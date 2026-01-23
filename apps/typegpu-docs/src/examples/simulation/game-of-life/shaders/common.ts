import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const computeLayout = tgpu.bindGroupLayout({
  current: { texture: d.texture2d(d.u32) },
  next: { storageTexture: d.textureStorage2d('r32uint') },
  sampler: { sampler: 'non-filtering' },
});

export const displayLayout = tgpu.bindGroupLayout({
  source: { storageTexture: d.textureStorage2d('r32uint', 'read-only') },
});

export const TILE_SIZE = 16;

export const gameSizeAccessor = tgpu['~unstable'].accessor(d.u32, 64);

export const loadTexAt = (pos: d.v2u): number => {
  'use gpu';
  return std.textureLoad(computeLayout.$.current, pos, 0).x;
};

export const golNextState = (alive: boolean, neighbors: number): boolean => {
  'use gpu';
  return (alive && (neighbors === 2 || neighbors === 3)) ||
    (!alive && neighbors === 3);
};
