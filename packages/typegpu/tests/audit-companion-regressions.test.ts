import { afterEach, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { d, std } from 'typegpu';
import { oklabGamutClip } from '../../typegpu-color/src/oklab.ts';
import { hexToRgb, hexToRgba } from '../../typegpu-color/src/hex.ts';
import { circle, circleVertexCount } from '../../typegpu-geometry/src/circle.ts';
import { polylineVariableWidth } from '../../typegpu-geometry/src/lines/polylineVariableWidth.ts';
import { randomGeneratorSlot, XOROSHIRO64STARSTAR } from '../../typegpu-noise/src/generator.ts';
import { dynamicCacheConfig as cache2d } from '../../typegpu-noise/src/perlin-2d/dynamic-cache.ts';
import { dynamicCacheConfig as cache3d } from '../../typegpu-noise/src/perlin-3d/dynamic-cache.ts';
import { randBernoulli, randOnUnitHemisphere } from '../../typegpu-noise/src/random.ts';
import { sdBezier } from '../../typegpu-sdf/src/2d.ts';

afterEach(() => vi.restoreAllMocks());

it('B36: resized Perlin caches retain their new buffer between reads', ({ root }) => {
  const two = cache2d().instance(root, d.vec2u(2, 2));
  const three = cache3d().instance(root, d.vec3u(2, 2, 2));
  try {
    two.size = d.vec2u(3, 3);
    three.size = d.vec3u(3, 3, 3);
    for (const readBuffer of [
      () => two.bindings.perlin2dCache__memory,
      () => three.bindings.perlin3dCache__memory,
    ]) {
      const first = readBuffer();
      const destroy = vi.spyOn(first, 'destroy');
      expect.soft(readBuffer()).toBe(first);
      expect.soft(destroy).not.toHaveBeenCalled();
    }
  } finally {
    two.destroy();
    three.destroy();
  }
});

it('B37: gamut clipping preserves finite achromatic Oklab colors', () => {
  for (const lightness of [0, 0.5, 1]) {
    const result = oklabGamutClip.preserveChroma(d.vec3f(lightness, 0, 0));
    expect(result.x).toBeCloseTo(lightness);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  }
});

it('B47: circle produces unit vertices within the advertised level-eight count', () => {
  const index = circleVertexCount(7);
  expect(index).toBeLessThan(circleVertexCount(8));
  const vertex = circle(index);
  expect(std.length(vertex)).toBeCloseTo(1);
});

it('B48: a hemisphere sample tangent to its normal still has unit length', () => {
  // 0.5 is a valid sample of the configured [0, 1) generator.
  vi.spyOn(randomGeneratorSlot, '$', 'get').mockReturnValue({ sample: () => 0.5 });
  const normal = d.vec3f(0, 0, 1);
  const sample = randOnUnitHemisphere(normal);
  expect(std.length(sample)).toBeCloseTo(1);
  expect(std.dot(sample, normal)).toBeGreaterThanOrEqual(0);
});

it('B49: Bernoulli with zero probability never succeeds for a zero random sample', () => {
  vi.spyOn(randomGeneratorSlot, '$', 'get').mockReturnValue({ sample: () => 0 });
  expect(randBernoulli(0)).toBe(0);
});

it('B50: hex parsers reject strings containing non-hexadecimal digits', () => {
  expect.soft(() => hexToRgb('#ffzzzz')).toThrow();
  expect.soft(() => hexToRgba('#ffzzzzff')).toThrow();
});

it('B73: a finite seed in the recommended range cannot trap XOROSHIRO at zero', () => {
  try {
    XOROSHIRO64STARSTAR.seed2!(d.vec2f(28.8883056640625, -3.9062703131821294e-15));
    const samples = Array.from({ length: 32 }, () => XOROSHIRO64STARSTAR.sample());
    expect(samples.some((value) => value !== 0)).toBe(true);
  } finally {
    XOROSHIRO64STARSTAR.seed!(1);
  }
});

it('B74: a point on a small non-collinear quadratic Bezier has zero distance', () => {
  // At t=0.5, (A + 2B + C)/4 is exactly this midpoint.
  const distance = sdBezier(
    d.vec2f(0.001, 0.00025),
    d.vec2f(0, 0),
    d.vec2f(0.001, 0.0005),
    d.vec2f(0.002, 0),
  );
  expect(Math.abs(distance)).toBeLessThan(1e-7);
});

it('B75: a straight polyline with positive radii returns its center vertex on CPU', () => {
  const point = (x: number) => ({ position: d.vec2f(x, 0), radius: 0.1 });
  const result = polylineVariableWidth(point(0), point(1), point(2), point(3), 0, 2);
  expect(result.vertexPosition).toEqual(d.vec2f(1, 0));
  expect(result.w).toBeCloseTo(10);
});
