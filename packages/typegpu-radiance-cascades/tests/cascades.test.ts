import { assert, describe, expect, it, vi } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import {
  cascadePassBGL,
  defaultRayMarch,
  getCascadeInfo,
  cascadePassCompute,
  hasUpperCascadeSlot,
  mergeModeSlot,
  RayMarchResult,
  rayMarchSlot,
  traceBilinearFork,
} from '../src/cascades.ts';

describe('cascade layout', () => {
  it('defaults to four rays without allocating the sixteen-ray texture budget', () => {
    const { layers, cascadeDim } = getCascadeInfo(512, 512);

    expect(layers[0]?.raysDimActual).toBe(2);
    expect(cascadeDim).toEqual([512, 512]);
  });

  it.each([8, 1 / 8])('covers scene aspect %s independently of output aspect', (renderAspect) => {
    const info = getCascadeInfo(64, 64, { renderAspect });

    expect(info.baseProbes).toEqual([64, 64]);
    expect(info.layers[0]?.startUv).toBe(0);
    for (let i = 1; i < info.layers.length; i++) {
      expect(info.layers[i]?.startUv).toBeCloseTo(info.layers[i - 1]?.endUv ?? Number.NaN);
    }
    expect(info.layers.at(-1)?.endUv).toBeGreaterThanOrEqual(Math.sqrt(65));
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

it.each([1, 0.5, 0])(
  'connects a boundary fork with transmittance %s to its upper interval',
  (transmittance) => {
    const trace = vi
      .fn(defaultRayMarch)
      .mockReturnValue({ color: d.vec3f(0.25, 0.5, 0.75), transmittance });
    const marcher = vi
      .spyOn<{ readonly $: unknown }, '$'>(rayMarchSlot, '$', 'get')
      .mockReturnValue(trace);

    const bindings = cascadePassBGL.$;
    const load = vi.spyOn(std, 'textureLoad').mockReturnValue(d.vec4f(1, 2, 3, 0.5));
    Object.defineProperty(cascadePassBGL, '$', {
      value: {
        upper: undefined,
        layerParams: {
          probesU: d.vec2u(32),
          startUv: 0,
          endUv: 1 / 64,
          aspect: 1,
          eps: 0.001,
          minStep: 0.0005,
          hitBias: 0,
        },
      },
    });

    try {
      const angle = (1.5 / 16) * 2 * Math.PI - Math.PI;
      const result = traceBilinearFork(
        d.vec2u(),
        d.vec2u(),
        d.vec2f(1 / 128),
        d.vec2f(Math.cos(angle), -Math.sin(angle)),
      );

      const call = trace.mock.calls[0];
      assert(call);
      const [origin, direction, start, end] = call;
      expect(origin).toEqual(d.vec2f(1 / 128));
      expect(start).toBe(0);
      expect(origin.x + direction.x * end).toBeCloseTo(0.0026332873, 8);
      expect(origin.y + direction.y * end).toBeCloseTo(0.0243057849, 8);

      expect(result).toEqual(
        d.vec4f(
          0.25 + transmittance,
          0.5 + 2 * transmittance,
          0.75 + 3 * transmittance,
          0.5 * transmittance,
        ),
      );
      expect(load).toHaveBeenCalledTimes(transmittance > 0 ? 1 : 0);
    } finally {
      Object.defineProperty(cascadePassBGL, '$', { value: bindings });
      load.mockRestore();
      marcher.mockRestore();
    }
  },
);

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
