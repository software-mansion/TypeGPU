import { describe, expect } from 'vitest';
import { d, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';
// Direct conversion tests must stay in the source module graph; `$internal`
// symbols differ between the built and source copies of `typegpu`.
import { d as srcD } from '../src/index.js';
import { getBestConversion } from '../src/tgsl/conversion.ts';

describe('array type mismatches', () => {
  it('throws when an array schema is called with a value of another array type', () => {
    const main = () => {
      'use gpu';
      const arr = [1.5, 2.5, 3.5];
      return d.arrayOf(d.u32, 3)(arr);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Cannot use a value of type 'arrayOf(f32, 3)' where 'arrayOf(u32, 3)' is expected.
      -----
      TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(u32, 3)([...])'.]
    `);
  });

  it('throws when an array of a different length is passed to a function', () => {
    const helper = tgpu.fn([d.arrayOf(d.i32, 5)])(() => {});
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      return helper(arr);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Cannot use a value of type 'arrayOf(i32, 3)' where 'arrayOf(i32, 5)' is expected.
      -----
      TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(i32, 5)([...])'.]
    `);
  });

  it('throws when the element types differ', () => {
    const helper = tgpu.fn([d.arrayOf(d.u32, 3)])(() => {});
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      return helper(arr);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Cannot use a value of type 'arrayOf(i32, 3)' where 'arrayOf(u32, 3)' is expected.
      -----
      TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(u32, 3)([...])'.]
    `);
  });

  it('throws for arrays of different struct element types', () => {
    const A = d.arrayOf(d.struct({ p: d.u32 }), 4);
    const B = d.arrayOf(d.struct({ p: d.f32 }), 4);
    const helper = tgpu.fn([B])(() => {});
    const main = () => {
      'use gpu';
      const a = A();
      return helper(a);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Cannot use a value of type 'arrayOf(struct:<unnamed>, 4)' where 'arrayOf(struct:<unnamed>, 4)' is expected.
      -----
      TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(struct:<unnamed>, 4)([...])'.]
    `);
  });

  it('still accepts arrays with a matching type', () => {
    const helper = tgpu.fn([d.arrayOf(d.i32, 3)])(() => {});
    const main = () => {
      'use gpu';
      const arr = [1, 2, 3];
      return helper(arr);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn helper(_arg_0: array<i32, 3>) {}

      fn main() {
        let arr = array<i32, 3>(1, 2, 3);
        return helper(arr);
      }"
    `);
  });
});

describe('array type mismatches through aliases', () => {
  it('throws when an aliased array has a different type', () => {
    const main = () => {
      'use gpu';
      const arr = [1.5, 2.5, 3.5];
      const alias = arr;
      return d.arrayOf(d.u32, 3)(alias);
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Cannot use a value of type 'arrayOf(f32, 3)' where 'arrayOf(u32, 3)' is expected.
      -----
      TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(u32, 3)([...])'.]
    `);
  });

  it('throws when assigning an array of a different length', () => {
    const main = () => {
      'use gpu';
      let arr = [1, 2, 3];
      arr = [4, 5];
      return arr;
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Cannot use a value of type 'arrayOf(i32, 2)' where 'arrayOf(i32, 3)' is expected.
      -----
      TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(i32, 3)([...])'.]
    `);
  });

  it('accepts an array whose element type only differs by a location attribute', () => {
    const LocatedArray = d.arrayOf(d.location(0, d.u32), 3);
    const helper = tgpu.fn([d.arrayOf(d.u32, 3)])(() => {});
    const main = () => {
      'use gpu';
      const arr = LocatedArray([1, 2, 3]);
      return helper(arr);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn helper(_arg_0: array<u32, 3>) {}

      fn main() {
        let arr = array<u32, 3>(1u, 2u, 3u);
        return helper(arr);
      }"
    `);
  });

  it('accepts nested array literals when element schemas match', () => {
    const Inner = d.arrayOf(d.u32, 2);
    const helper = tgpu.fn([d.arrayOf(Inner, 2)])(() => {});
    const main = () => {
      'use gpu';
      const nested = [Inner([1, 2]), Inner([3, 4])];
      return helper(nested);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn helper(_arg_0: array<array<u32, 2>, 2>) {}

      fn main() {
        let nested = array<array<u32, 2>, 2>(array<u32, 2>(1u, 2u), array<u32, 2>(3u, 4u));
        return helper(nested);
      }"
    `);
  });
});

describe('array unification', () => {
  it('accepts a multi-candidate conversion when one candidate matches', () => {
    const matching = srcD.arrayOf(srcD.i32, 3);
    const mismatching = srcD.arrayOf(srcD.i32, 5);

    expect(() => getBestConversion([matching], [matching, mismatching])).not.toThrow();
    expect(() => getBestConversion([matching], [mismatching, matching])).not.toThrow();
  });
});

describe('array conversions at the conversion layer', () => {
  it('treats separately created equal element schemas as compatible', () => {
    const src = srcD.arrayOf(srcD.atomic(srcD.u32), 4);
    const dest = srcD.arrayOf(srcD.atomic(srcD.u32), 4);

    expect(() => getBestConversion([src], [dest])).not.toThrow();
    expect(getBestConversion([src], [dest])?.targetType).toEqual(dest);
  });

  it('throws when converting between arrays of different lengths', () => {
    expect(() => getBestConversion([srcD.arrayOf(srcD.u32, 3)], [srcD.arrayOf(srcD.u32, 5)]))
      .toThrowErrorMatchingInlineSnapshot(`
        [Error: Cannot use a value of type 'arrayOf(u32, 3)' where 'arrayOf(u32, 5)' is expected.
        -----
        TypeGPU does not convert arrays between different array types automatically. Construct the value with the expected schema instead, e.g. 'arrayOf(u32, 5)([...])'.]
      `);
  });
});
