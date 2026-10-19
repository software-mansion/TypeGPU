import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import {
  cascadePassCompute,
  getCascadeInfo,
  hasUpperCascadeSlot,
  mergeModeSlot,
  RayMarchResult,
  rayMarchSlot,
} from '../src/cascades.ts';

describe('cascade layout', () => {
  it('defaults to four rays without allocating the sixteen-ray texture budget', () => {
    const { layers, cascadeDim } = getCascadeInfo(512, 512);

    expect(layers[0]?.raysDimStored).toBe(1);
    expect(cascadeDim).toEqual([512, 512]);
  });

  it.each([8, 1 / 8])('covers scene aspect %s independently of output aspect', (renderAspect) => {
    const info = getCascadeInfo(64, 64, { renderAspect });

    expect(info.baseProbes).toEqual([64, 64]);
    expect(info.layers[0]?.startT).toBe(0);
    for (let i = 1; i < info.layers.length; i++) {
      expect(info.layers[i]?.startT).toBeCloseTo(info.layers[i - 1]?.endT ?? Number.NaN);
    }
    expect(info.layers.at(-1)?.endT).toBeGreaterThanOrEqual(Math.sqrt(65));
  });

  it.each([
    [512, 512],
    [333, 777],
    [1920, 1080],
    [9, 5],
  ])('fits every probe and direction into the allocated %i × %i layout', (width, height) => {
    for (const baseStoredRayDim of [1, 2, 4] as const) {
      const info = getCascadeInfo(width, height, { baseStoredRayDim });
      for (const layer of info.layers) {
        for (const axis of [0, 1] as const) {
          const required = layer.probes[axis] * layer.raysDimStored;
          expect(layer.validDim[axis]).toBe(required);
          expect(required).toBeLessThanOrEqual(info.cascadeDim[axis]);
        }
      }
    }
  });
});

it.each([
  { mergeMode: 'hardware', hasUpperCascade: true },
  { mergeMode: 'bilinear-fix', hasUpperCascade: true },
  { mergeMode: 'hardware', hasUpperCascade: false },
] as const)(
  'uses a custom marcher without requiring SDF or emission callbacks: %j',
  ({ mergeMode, hasUpperCascade }) => {
    const rayMarch = tgpu.fn(
      [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32],
      RayMarchResult,
    )(() => {
      'use gpu';
      return RayMarchResult({ color: d.vec3f(1), transmittance: 0 });
    });

    expect(() =>
      tgpu.resolve([cascadePassCompute], {
        config: (cfg) =>
          cfg
            .with(rayMarchSlot, rayMarch)
            .with(hasUpperCascadeSlot, hasUpperCascade)
            .with(mergeModeSlot, mergeMode),
      }),
    ).not.toThrow();
  },
);
