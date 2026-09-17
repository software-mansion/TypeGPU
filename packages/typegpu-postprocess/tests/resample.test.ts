import { expect, it, vi } from 'vitest';
import { d, std } from 'typegpu';
import * as post from '@typegpu/postprocess';

function sample(pass: post.StandalonePass, uv: d.v2f, pixels: d.v4f[]) {
  const dimensions = vi.spyOn(std, 'textureDimensions');
  dimensions.mockImplementation((() => d.vec2u(2)) as unknown as typeof std.textureDimensions);
  const load = vi.spyOn(std, 'textureLoad').mockImplementation((_texture, coords) => {
    const pixel = pixels[coords.y * 2 + coords.x];
    if (!pixel) {
      throw new Error('Out-of-bounds texture read');
    }
    return d.vec4f(pixel);
  });
  try {
    return pass.callback({} as d.texture2d<d.F32>, uv);
  } finally {
    dimensions.mockRestore();
    load.mockRestore();
  }
}

it('nearest selects one pixel and bilinear/bicubic interpolate at pixel centers', () => {
  const pixels = [1, 2, 3, 4].map((n) => d.vec4f(n, n * 2, 0, n / 4));
  expect(sample(post.resampleNearest({ size: [4, 4] }), d.vec2f(0.5), pixels)).toEqual(pixels[3]);
  for (const make of [post.resampleBilinear, post.resampleBicubic]) {
    const pass = make({ size: 'adapt' });
    expect(sample(pass, d.vec2f(0.5), pixels)).toEqual(d.vec4f(2.5, 5, 0, 0.625));
    for (const [i, pixel] of pixels.entries()) {
      expect(
        sample(pass, d.vec2f(((i % 2) + 0.5) / 2, (Math.floor(i / 2) + 0.5) / 2), pixels),
      ).toEqual(pixel);
    }
  }
});

it('resamplers preserve constant colors and clamp edge reads', () => {
  const color = d.vec4f(0.2, 0.4, 0.6, 0.8);
  const pixels = Array.from({ length: 4 }, () => color);
  for (const make of [post.resampleNearest, post.resampleBilinear, post.resampleBicubic]) {
    for (const uv of [d.vec2f(0), d.vec2f(1), d.vec2f(0.1, 0.8)]) {
      const actual = sample(make({ size: 'adapt' }), uv, pixels);
      for (const key of ['x', 'y', 'z', 'w'] as const) {
        expect(actual[key]).toBeCloseTo(color[key], 6);
      }
    }
  }
  expect(post.resampleBiliear).toBe(post.resampleBilinear);
});
