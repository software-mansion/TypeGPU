import { describe, expect, expectTypeOf } from 'vitest';
import { tgpu, d, std, type TgpuAccessor } from 'typegpu';
import { it } from 'typegpu-testing-utility';

const RED = d.vec3f(1, 0, 0);
const Boid = d.struct({
  pos: d.vec3f,
});
const BoidArray = d.arrayOf(Boid);

describe('tgpu.accessor', () => {
  it('resolves to invocation of provided function', () => {
    const colorAccess = tgpu.accessor(d.vec3f);

    const red = tgpu.fn([], d.vec3f)('() { return RED; }').$uses({ RED });

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess })
      .with(colorAccess, red);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn red() -> vec3f { return vec3f(1, 0, 0); }

      fn getColor() -> vec3f { return red(); }"
    `);
  });

  it('resolves to invocation of provided shellless callback', () => {
    const colorAccess = tgpu.accessor(d.vec3f, () => {
      'use gpu';
      return d.vec3f(1, 2, 3);
    });

    const getColor = () => {
      'use gpu';
      return colorAccess.$;
    };

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn colorAccess() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn getColor() -> vec3f {
        return colorAccess();
      }"
    `);
  });

  it('resolves to result of a comptime callback', () => {
    const colorAccess = tgpu.accessor(
      d.vec3f,
      tgpu.comptime(() => d.vec3f(1, 2, 3)),
    );

    const getColor = () => {
      'use gpu';
      return colorAccess.$;
    };

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f {
        return vec3f(1, 2, 3);
      }"
    `);
  });

  it('resolves to provided buffer usage', ({ root }) => {
    const colorAccess = tgpu.accessor(d.vec3f);

    const redUniform = root.createBuffer(d.vec3f, RED).$usage('uniform').as('uniform');

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`
      .$uses({ colorAccess })
      .with(colorAccess, redUniform);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> redUniform: vec3f;

      fn getColor() -> vec3f { return redUniform; }"
    `);
  });

  it('resolves to resolved form of provided JS value', () => {
    const colorAccess = tgpu.accessor(d.vec3f);
    const multiplierAccess = tgpu.accessor(d.f32);

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess * multiplierAccess; }`
      .$uses({ colorAccess, multiplierAccess })
      .with(colorAccess, RED)
      .with(multiplierAccess, 2);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(
      `"fn getColor() -> vec3f { return vec3f(1, 0, 0) * 2f; }"`,
    );
  });

  it('resolves to default value if no value provided', () => {
    const colorAccess = tgpu.accessor(d.vec3f, RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`.$uses({ colorAccess });

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(
      `"fn getColor() -> vec3f { return vec3f(1, 0, 0); }"`,
    );
  });

  it('resolves to provided value rather than default value', () => {
    const colorAccess = tgpu.accessor(d.vec3f, RED); // red by default

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`.$uses({ colorAccess });

    // overriding to green
    const getColorWithGreen = getColor.with(colorAccess, d.vec3f(0, 1, 0));

    const main = tgpu.fn([])`() { return getColorWithGreen(); }`.$uses({ getColorWithGreen });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f { return vec3f(0, 1, 0); }

      fn main() { return getColor(); }"
    `);
  });

  it('throws error when no default nor value provided', () => {
    const colorAccess = tgpu.accessor(d.vec3f).$name('color');

    const getColor = tgpu.fn([], d.vec3f)`() { return colorAccess; }`.$uses({ colorAccess });

    expect(() => tgpu.resolve([getColor])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:getColor
        - accessor:color: Missing value for 'slot:color']
      `);
  });

  it('resolves in tgsl functions, using .$', ({ root }) => {
    const redUniform = root.createBuffer(d.vec3f, RED).$usage('uniform').as('uniform');

    const colorValueAccess = tgpu.accessor(d.vec3f, RED);
    const colorUsageAccess = tgpu.accessor(d.vec3f, redUniform);

    const getColor = tgpu.fn([], d.vec3f)(() => RED);
    const colorAccessorFn = tgpu.accessor(d.vec3f, getColor);

    const main = tgpu.fn([])(() => {
      const color = colorValueAccess.$;
      const color2 = colorUsageAccess.$;
      const color3 = colorAccessorFn.$;

      const colorX = colorValueAccess.$.x;
      const color2X = colorUsageAccess.$.x;
      const color3X = colorAccessorFn.$.x;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> redUniform: vec3f;

      fn getColor() -> vec3f {
        return vec3f(1, 0, 0);
      }

      fn main() {
        let color = vec3f(1, 0, 0);
        let color2 = (&redUniform);
        let color3 = getColor();
        const colorX = 1f;
        let color2X = redUniform.x;
        let color3X = getColor().x;
      }"
    `);
  });

  it('prunes unused functions', () => {
    const helper = () => {
      'use gpu';
      return 2;
    };
    const helperAccess = tgpu.accessor(d.u32, helper);

    const ctx = {
      get helper() {
        return helperAccess.$;
      },
    };

    const main = () => {
      'use gpu';
      if (2 + 2 === 5) {
        return ctx.helper;
      }
      return 0;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        return 0;
      }"
    `);
  });

  it('retains type information', () => {
    // Typed as f32, but literal could be automatically inferred as an i32
    const fooAccess = tgpu.accessor(d.f32, 1);

    const main = tgpu.fn([])(() => {
      const foo = fooAccess.$;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() {
        const foo = 1f;
      }"
    `);
  });

  it('can provide parts of a bind group layout', () => {
    const ImageData = (count: number) =>
      d.struct({
        width: d.u32,
        height: d.u32,
        pixels: d.arrayOf(d.vec4f, count),
      });

    const layout = tgpu.bindGroupLayout({
      image: { storage: ImageData, access: 'readonly' },
    });

    const imageAccess = tgpu.accessor(
      ImageData,
      // The default value for the accessor, but can be swapped the
      // same way a slot can
      () => layout.$.image,
    );

    const getPixel = (x: number, y: number) => {
      'use gpu';
      const width = imageAccess.$.width;
      const pixels = imageAccess.$.pixels;
      return d.vec4f(pixels[x + y * width]!);
    };

    const main = () => {
      'use gpu';
      const pixel = getPixel(0, 0);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct item {
        width: u32,
        height: u32,
        pixels: array<vec4f>,
      }

      @group(0) @binding(0) var<storage, read> image: item;

      fn getPixel(x: i32, y: i32) -> vec4f {
        let width = image.width;
        let pixels = (&image.pixels);
        return (*pixels)[(x + (y * i32(width)))];
      }

      fn main() {
        let pixel = getPixel(0i, 0i);
      }"
    `);
  });

  it('can provide a variable', () => {
    const colorAccess = tgpu.accessor(d.vec3f);

    const getColor = tgpu.fn(
      [],
      d.vec3f,
    )(() => {
      'use gpu';
      return colorAccess.$;
    });

    const privateColor = tgpu.privateVar(d.vec3f);
    const workgroupColor = tgpu.workgroupVar(d.vec3f);

    const getColorPrivate = getColor.with(colorAccess, privateColor);
    const getColorWorkgroup = getColor.with(colorAccess, workgroupColor);

    const main = () => {
      'use gpu';
      const foo = getColorPrivate();
      const bar = getColorWorkgroup();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "var<private> privateColor: vec3f;

      fn getColor() -> vec3f {
        return privateColor;
      }

      var<workgroup> workgroupColor: vec3f;

      fn getColor_1() -> vec3f {
        return workgroupColor;
      }

      fn main() {
        let foo = getColor();
        let bar = getColor_1();
      }"
    `);
  });

  it('can provide a constant', () => {
    const colorAccess = tgpu.accessor(d.vec3f);

    const getColor = tgpu.fn(
      [],
      d.vec3f,
    )(() => {
      'use gpu';
      return colorAccess.$;
    });

    const constantColor = tgpu.const(d.vec3f, d.vec3f(0.1, 0.5, 0.3));
    const getColor2 = getColor.with(colorAccess, constantColor);

    const main = () => {
      'use gpu';
      const foo = getColor2();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const constantColor: vec3f = vec3f(0.10000000149011612, 0.5, 0.30000001192092896);

      fn getColor() -> vec3f {
        return constantColor;
      }

      fn main() {
        let foo = getColor();
      }"
    `);
  });

  it('can provide a runtime-sized array', () => {
    const ImageStruct = (count: number) =>
      d.struct({
        width: d.u32,
        height: d.u32,
        pixels: d.arrayOf(d.vec4f, count),
      });
    type ImageStruct = d.Infer<ReturnType<typeof ImageStruct>>;

    const layout = tgpu.bindGroupLayout({
      one: { storage: ImageStruct, access: 'mutable' },
      two: { storage: ImageStruct, access: 'mutable' },
    });

    const imageSlot = tgpu.accessor(ImageStruct, () => layout.$.one);

    const getPixel = (x: number, y: number) => {
      'use gpu';
      const width = imageSlot.$.width;
      const pixels = imageSlot.$.pixels;
      return d.vec4f(pixels[x + y * width]!);
    };

    const main = () => {
      'use gpu';
      const pixel = getPixel(0, 0);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct item {
        width: u32,
        height: u32,
        pixels: array<vec4f>,
      }

      @group(0) @binding(0) var<storage, read_write> one: item;

      fn getPixel(x: i32, y: i32) -> vec4f {
        let width = one.width;
        let pixels = (&one.pixels);
        return (*pixels)[(x + (y * i32(width)))];
      }

      fn main() {
        let pixel = getPixel(0i, 0i);
      }"
    `);
  });

  it('can provide a deep reference to a nested data structure', ({ root }) => {
    const boids = root.createReadonly(BoidArray(100));

    const anyBoidPosAccess = tgpu.accessor(
      d.vec3f,
      // Arbitrarily giving access to the first boid's position
      () => boids.$[0]!.pos,
    );

    const main = () => {
      'use gpu';
      const firstX = anyBoidPosAccess.$.x;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }

      @group(0) @binding(0) var<storage, read> boids: array<Boid, 100>;

      fn main() {
        let firstX = boids[0].pos.x;
      }"
    `);
  });

  it('can provide a mutable reference (non-primitive)', ({ root }) => {
    const boids = root.createMutable(BoidArray(100));

    const boidAccess = tgpu.mutableAccessor(Boid, () => boids.$[0]!);

    const main = () => {
      'use gpu';
      boidAccess.$.pos.x += 1;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }

      @group(0) @binding(0) var<storage, read_write> boids: array<Boid, 100>;

      fn main() {
        boids[0].pos.x += 1f;
      }"
    `);
  });

  it('can provide a mutable reference (primitive)', ({ root }) => {
    const Ctx = d.struct({
      counter: d.f32,
    });
    const ctx = root.createMutable(Ctx);

    const counterAccess = tgpu.mutableAccessor(d.f32, () => ctx.$.counter);

    const main = () => {
      'use gpu';
      counterAccess.$ += 1;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Ctx {
        counter: f32,
      }

      @group(0) @binding(0) var<storage, read_write> ctx: Ctx;

      fn main() {
        ctx.counter += 1f;
      }"
    `);
  });

  it('can provide texture views', ({ root }) => {
    const texture = root
      .createTexture({
        format: 'rgba8unorm',
        size: [100, 100],
      })
      .$usage('storage');

    const storageView = texture.createView(d.textureStorage2d('rgba8unorm'));

    const textureAccess = tgpu.accessor(d.textureStorage2d('rgba8unorm'), storageView);

    const main = () => {
      'use gpu';
      std.textureStore(textureAccess.$, d.vec2u(), d.vec4f(1));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var storageView: texture_storage_2d<rgba8unorm, write>;

      fn main() {
        textureStore(storageView, vec2u(), vec4f(1));
      }"
    `);
  });

  it('allows for slot access', ({ root }) => {
    const ImageData = (count: number) =>
      d.struct({
        pixels: d.arrayOf(d.vec3f, count),
      });

    const layout = tgpu.bindGroupLayout({
      image: { storage: ImageData },
    });

    const pixelIdx = tgpu.slot(0);
    const pixelAccess = tgpu.accessor(d.f32, () => layout.$.image.pixels[pixelIdx.$]!.x);

    const main = tgpu
      .fn([])(() => {
        'use gpu';
        const hello = pixelAccess.$;
      })
      .with(pixelIdx, 4);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct item {
        pixels: array<vec3f>,
      }

      @group(0) @binding(0) var<storage, read> image: item;

      fn main() {
        let hello = image.pixels[4].x;
      }"
    `);
  });

  it('throws when $ is accessed outside of codegen mode', () => {
    const colorAccess = tgpu.accessor(d.vec3f);
    expect(() => colorAccess.$).toThrow(
      '`tgpu.accessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call. Use `tgpu.slot` for non-WGSL values instead.',
    );
  });

  it('throws when mutable $ is accessed outside of codegen mode', () => {
    const counterAccess = tgpu.mutableAccessor(d.u32);
    expect(() => counterAccess.$).toThrow(
      '`tgpu.mutableAccessor` relies on GPU resources and cannot be accessed outside of a compute dispatch or draw call. Use `tgpu.slot` for non-WGSL values instead.',
    );
  });

  it('allows for arbitrarily nested access functions', ({ root }) => {
    const counterMutable = root.createMutable(d.u32);

    const counterAccess = tgpu.accessor(d.u32, () => () => () => counterMutable.$);

    const main = () => {
      'use gpu';
      return counterAccess.$ / 2;
    };

    expectTypeOf(counterAccess).toEqualTypeOf<TgpuAccessor<d.U32>>();
    expectTypeOf<typeof counterAccess.$>().toEqualTypeOf<number>();

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> counterMutable: u32;

      fn main() -> f32 {
        return (f32(counterMutable) / 2f);
      }"
    `);
  });

  it('correctly infers input type from array schema', () => {
    const accessor = tgpu.accessor(d.arrayOf(d.u32, 1), d.arrayOf(d.u32, 1)([1]));
    expectTypeOf(accessor).toEqualTypeOf<TgpuAccessor<d.WgslArray<d.U32>>>();
  });

  it('allows zero-argument dualFn', () => {
    const accessor = tgpu.accessor(d.bool, std.subgroupElect);

    expect(
      tgpu.resolve([
        () => {
          'use gpu';
          return accessor.$;
        },
      ]),
    ).toMatchInlineSnapshot(`
      "fn item() -> bool {
        return subgroupElect();
      }"
    `);
  });
});

describe('tgpu.accessor type validation', () => {
  it('throws when a buffer does not match the schema', ({ root }) => {
    const valueAccess = tgpu.accessor(d.f32);
    const buf = root.createUniform(d.u32);
    const main = tgpu
      .fn(() => {
        'use gpu';
        return valueAccess.$;
      })
      // @ts-expect-error -- testing runtime validation of invalid values
      .with(valueAccess, buf);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Value of type 'u32' does not match the schema of accessor 'valueAccess': 'f32'.]
    `);
  });

  it('throws when a GPU function does not return the schema', () => {
    const valueAccess = tgpu.accessor(d.f32, () => {
      'use gpu';
      return 1;
    });
    const main = () => {
      'use gpu';
      return valueAccess.$;
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Value of type 'i32' does not match the schema of accessor 'valueAccess': 'f32'.]
    `);
  });

  it('converts numbers returned from tgpu.comptime', () => {
    const valueAccess = tgpu.accessor(
      d.f32,
      tgpu.comptime(() => 1),
    );
    const main = () => {
      'use gpu';
      return valueAccess.$;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        return 1f;
      }"
    `);
  });
});

describe('tgpu.accessor with runtime-sized array schema', () => {
  const dataAccess = tgpu.accessor(d.arrayOf(d.f32));

  function sum() {
    'use gpu';
    let acc = d.f32(0);
    for (let i = d.u32(0); i < dataAccess.$.length; i++) {
      acc += dataAccess.$[i]!;
    }
    return acc;
  }

  it('accepts a runtime-sized bind group layout entry', () => {
    const layout = tgpu.bindGroupLayout({
      data: { storage: d.arrayOf(d.f32) },
    });

    const main = tgpu.fn(sum).with(dataAccess, () => layout.$.data);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> data: array<f32>;

      fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < arrayLength(&data)); i++) {
          acc += data[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts a statically-sized buffer usage', ({ root }) => {
    const buf = root.createReadonly(d.arrayOf(d.f32, 4));
    const main = tgpu.fn(sum).with(dataAccess, buf);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> buf: array<f32, 4>;

      fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 4u); i++) {
          acc += buf[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts a statically-sized uniform usage', ({ root }) => {
    const buf = root.createUniform(d.arrayOf(d.vec4f, 4));
    const acc2 = tgpu.accessor(d.arrayOf(d.vec4f));
    const main = tgpu
      .fn(() => {
        'use gpu';
        return std.copy(acc2.$[1]!);
      })
      .with(acc2, buf);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> buf: array<vec4f, 4>;

      fn main() -> vec4f {
        return buf[1i];
      }"
    `);
  });

  it('accepts a statically-sized tgpu.const', () => {
    const c = tgpu.const(d.arrayOf(d.f32, 3), [1, 2, 3]);
    const main = tgpu.fn(sum).with(dataAccess, c);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const c: array<f32, 3> = array<f32, 3>(1f, 2f, 3f);

      fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 3u); i++) {
          acc += c[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts a statically-sized variable', () => {
    const v = tgpu.privateVar(d.arrayOf(d.f32, 3), [1, 2, 3]);
    const main = tgpu.fn(sum).with(dataAccess, v);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "var<private> v: array<f32, 3> = array<f32, 3>(1f, 2f, 3f);

      fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 3u); i++) {
          acc += v[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts an array literal', () => {
    const main = tgpu.fn(sum).with(dataAccess, [1, 2, 3]);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 3u); i++) {
          acc += array<f32, 3>(1f, 2f, 3f)[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts a statically-sized array schema instance', () => {
    const main = tgpu.fn(sum).with(dataAccess, d.arrayOf(d.f32, 3)([1, 2, 3]));

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 3u); i++) {
          acc += array<f32, 3>(1f, 2f, 3f)[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts an array returned from tgpu.comptime', () => {
    const main = tgpu.fn(sum).with(
      dataAccess,
      tgpu.comptime(() => [1, 2, 3]),
    );
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 3u); i++) {
          acc += array<f32, 3>(1f, 2f, 3f)[i];
        }
        return acc;
      }"
    `);
  });

  it('accepts a GPU function returning a statically-sized array', () => {
    const getArr = () => {
      'use gpu';
      return d.arrayOf(d.f32, 3)([1, 2, 3]);
    };
    const main = tgpu.fn(sum).with(dataAccess, getArr);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getArr() -> array<f32, 3> {
        return array<f32, 3>(1f, 2f, 3f);
      }

      fn sum() -> f32 {
        var acc = 0f;
        for (var i = 0u; (i < 3u); i++) {
          acc += getArr()[i];
        }
        return acc;
      }"
    `);
  });

  it('throws when a GPU function returns a mismatched array', () => {
    const getArr = () => {
      'use gpu';
      return d.arrayOf(d.i32, 3)([1, 2, 3]);
    };
    const main = tgpu.fn(sum).with(dataAccess, getArr);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:sum
      - fn*:sum(): Value of type 'arrayOf(i32, 3)' does not match the schema of accessor 'dataAccess': 'arrayOf(f32, 0)'.]
    `);
  });

  it('throws when a buffer has a mismatched element type', ({ root }) => {
    const buf = root.createReadonly(d.arrayOf(d.u32, 4));
    // @ts-expect-error -- testing runtime validation of invalid values
    const main = tgpu.fn(sum).with(dataAccess, buf);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:sum
      - fn*:sum(): Value of type 'arrayOf(u32, 4)' does not match the schema of accessor 'dataAccess': 'arrayOf(f32, 0)'.]
    `);
  });

  it('accepts an array literal as the default value', () => {
    const acc3 = tgpu.accessor(d.arrayOf(d.f32), [4, 5]);
    const main = () => {
      'use gpu';
      return acc3.$[0]!;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        return 4f;
      }"
    `);
  });

  it('throws when an empty array is provided', () => {
    const main = tgpu.fn(sum).with(dataAccess, []);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:sum
      - fn*:sum(): Cannot use empty array as an accessor value. Empty arrays aren't representable in shader code.]
    `);
  });
});

describe('tgpu.mutableAccessor validation', () => {
  const dataAccess = tgpu.mutableAccessor(d.arrayOf(d.f32));

  function double() {
    'use gpu';
    for (let i = d.u32(0); i < dataAccess.$.length; i++) {
      dataAccess.$[i]! *= 2;
    }
  }

  it('accepts a statically-sized mutable buffer for a runtime-sized schema', ({ root }) => {
    const buf = root.createMutable(d.arrayOf(d.f32, 4));
    const main = tgpu.fn(double).with(dataAccess, buf);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> buf: array<f32, 4>;

      fn double() {
        for (var i = 0u; (i < 4u); i++) {
          buf[i] *= 2f;
        }
      }"
    `);
  });

  it('accepts a private variable', () => {
    const v = tgpu.privateVar(d.arrayOf(d.f32, 3));
    const main = tgpu.fn(double).with(dataAccess, v);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "var<private> v: array<f32, 3>;

      fn double() {
        for (var i = 0u; (i < 3u); i++) {
          v[i] *= 2f;
        }
      }"
    `);
  });

  it('throws when provided a readonly buffer', ({ root }) => {
    const buf = root.createReadonly(d.arrayOf(d.f32, 4));
    const main = tgpu.fn(double).with(dataAccess, buf);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:double
      - fn*:double(): Values provided to mutable accessor 'dataAccess' must be mutable (e.g. mutable buffers, private or workgroup variables), got a value with origin 'readonly'. Use tgpu.accessor for read-only access.]
    `);
  });

  it('throws when provided a uniform buffer', ({ root }) => {
    const counterAccess = tgpu.mutableAccessor(d.u32);
    const buf = root.createUniform(d.u32);
    const main = tgpu
      .fn(() => {
        'use gpu';
        counterAccess.$ += 1;
      })
      .with(counterAccess, buf);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Values provided to mutable accessor 'counterAccess' must be mutable (e.g. mutable buffers, private or workgroup variables), got a value with origin 'uniform'. Use tgpu.accessor for read-only access.]
    `);
  });

  it('throws when provided a constant', () => {
    const c = tgpu.const(d.arrayOf(d.f32, 3), [1, 2, 3]);
    // @ts-expect-error -- testing runtime validation of invalid values
    const main = tgpu.fn(double).with(dataAccess, c);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:double
      - fn*:double(): Values provided to mutable accessor 'dataAccess' must be mutable (e.g. mutable buffers, private or workgroup variables), got a value with origin 'constant-immutable-def'. Use tgpu.accessor for read-only access.]
    `);
  });

  it('throws when provided the result of a GPU function', () => {
    const getArr = () => {
      'use gpu';
      return d.arrayOf(d.f32, 3)([1, 2, 3]);
    };
    const main = tgpu.fn(double).with(dataAccess, getArr);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:double
      - fn*:double(): Values provided to mutable accessor 'dataAccess' must be mutable (e.g. mutable buffers, private or workgroup variables), got a value with origin 'runtime'. Use tgpu.accessor for read-only access.]
    `);
  });

  it('throws when the element type does not match', ({ root }) => {
    const buf = root.createMutable(d.arrayOf(d.i32, 4));
    // @ts-expect-error -- testing runtime validation of invalid values
    const main = tgpu.fn(double).with(dataAccess, buf);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:double
      - fn*:double(): Value of type 'arrayOf(i32, 4)' does not match the schema of mutable accessor 'dataAccess': 'arrayOf(f32, 0)'.]
    `);
  });

  it('throws when the type does not match', ({ root }) => {
    const counterAccess = tgpu.mutableAccessor(d.f32);
    const buf = root.createMutable(d.u32);
    const main = tgpu
      .fn(() => {
        'use gpu';
        counterAccess.$ += 1;
      })
      // @ts-expect-error -- testing runtime validation of invalid values
      .with(counterAccess, buf);

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Value of type 'u32' does not match the schema of mutable accessor 'counterAccess': 'f32'.]
    `);
  });
});
