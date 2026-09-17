import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { tgpu, d, std, type TgpuAccessor } from 'typegpu';
import * as post from '@typegpu/postprocess';

// Accessors, like textures, are GPU-only resources; give scalar inputs a CPU reader.
const createAccessor = tgpu.accessor;
beforeEach(() => {
  vi.spyOn(tgpu, 'accessor').mockImplementation(((schema: d.I32, input: TgpuAccessor.In<d.I32>) => {
    const accessor = createAccessor(schema, input);
    Object.defineProperty(accessor, '$', {
      get: () => (typeof input === 'function' ? input() : input),
    });
    return accessor;
  }) as unknown as typeof tgpu.accessor);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Run the actual shader callbacks on the CPU with in-memory texture reads.
function apply(pass: post.StandalonePass, pixels: d.v4f[], width: number, height: number) {
  const dimensions = vi.spyOn(std, 'textureDimensions');
  // This fixture uses only the 2D overload.
  dimensions.mockImplementation((() =>
    d.vec2u(width, height)) as unknown as typeof std.textureDimensions);
  const load = vi.spyOn(std, 'textureLoad').mockImplementation((_texture, coords) => {
    const pixel = pixels[coords.y * width + coords.x];
    if (!pixel) {
      throw new Error('Blur read outside the image.');
    }
    return d.vec4f(pixel);
  });
  try {
    // Texture access is handled exclusively by the mocks above.
    const texture = {} as d.texture2d<d.F32>;
    return pixels.map((_, i) =>
      pass.callback(
        texture,
        d.vec2f(((i % width) + 0.5) / width, (Math.floor(i / width) + 0.5) / height),
      ),
    );
  } finally {
    dimensions.mockRestore();
    load.mockRestore();
  }
}

for (const [single, separable] of [
  [post.singlePassGaussianBlur, post.separableGaussianBlur],
  [post.singlePassBoxBlur, post.separableBoxBlur],
] as const) {
  it(`${separable.name} matches the 2D kernel, including borders and alpha`, () => {
    for (const [width, height, radius] of [
      [5, 3, 2],
      [1, 4, 3],
      [3, 1, 0],
    ] as const) {
      const pixels = Array.from({ length: width * height }, (_, i) =>
        d.vec4f(i % 3, i / 5, i % 2, i / (width * height)),
      );
      const options = { radius, sigma: 0.7 };
      const expected = apply(single(options), pixels, width, height);
      let actual = pixels;
      for (const pass of separable(options).passes) {
        if (pass.kind !== 'standalone') {
          throw new Error('Expected a texture pass.');
        }
        actual = apply(pass, actual, width, height);
      }
      actual.forEach((pixel, i) => {
        for (const component of ['x', 'y', 'z', 'w'] as const) {
          expect(pixel[component]).toBeCloseTo(expected[i]?.[component] ?? NaN, 5);
        }
      });
    }
  });
}

for (const makeBlur of [
  post.bokehBlur,
  post.singlePassGaussianBlur,
  post.separableGaussianBlur,
  post.singlePassBoxBlur,
  post.separableBoxBlur,
]) {
  it(`${makeBlur.name} reevaluates dynamic radius and default sigma`, () => {
    let value = 0;
    const dynamic = makeBlur({
      radius: () => {
        'use gpu';
        return value;
      },
    });
    const pixels = [d.vec4f(1, 2, 3, 0.2), d.vec4f(3, 2, 1, 0.8), d.vec4f(0)];
    function run(pass: post.StandalonePass | post.PassGroup) {
      let result = pixels;
      const stages = pass.kind === 'group' ? pass.passes : [pass];
      for (const stage of stages) {
        if (stage.kind !== 'standalone') {
          throw new Error('Expected texture pass.');
        }
        result = apply(stage, result, 3, 1);
      }
      return result;
    }
    for (value of [-2, 0, 1, 4, 65]) {
      expect(run(dynamic)).toEqual(run(makeBlur({ radius: Math.max(0, Math.min(value, 64)) })));
    }
  });
}

it('bokeh spreads a point into a normalized disk rather than a square', () => {
  const pixels = Array.from({ length: 81 }, (_, i) =>
    i === 40 ? d.vec4f(13, 26, 39, 1) : d.vec4f(0),
  );
  const result = apply(post.bokehBlur({ radius: 2 }), pixels, 9, 9);
  // A radius-two disk has 13 pixel centers: five on its middle row,
  // three on each adjacent row, and one on each outer row.
  const footprint = [22, 30, 31, 32, 38, 39, 40, 41, 42, 48, 49, 50, 58];
  result.forEach((pixel, i) => {
    expect(pixel.x).toBe(footprint.includes(i) ? 1 : 0);
    expect(pixel.y).toBe(footprint.includes(i) ? 2 : 0);
    expect(pixel.z).toBe(footprint.includes(i) ? 3 : 0);
    expect(pixel.a).toBeCloseTo(footprint.includes(i) ? 1 / 13 : 0);
  });
});

it('bokeh preserves constant RGBA at clamped borders and averages repeated edge samples', () => {
  const constant = Array.from({ length: 3 }, () => d.vec4f(4, 2, 1, 0.5));
  expect(apply(post.bokehBlur({ radius: 4 }), constant, 1, 3)).toEqual(constant);
  const pixels = [d.vec4f(5), d.vec4f(0)];
  expect(apply(post.bokehBlur({ radius: 1 }), pixels, 2, 1)).toEqual([d.vec4f(4), d.vec4f(1)]);
  expect(apply(post.bokehBlur({ radius: 0 }), pixels, 2, 1)).toEqual(pixels);
});
