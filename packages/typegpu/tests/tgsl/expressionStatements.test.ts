import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';

describe('expression statements', () => {
  it('forbids numeric expression statements', () => {
    const fn = () => {
      'use gpu';
      1;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '1;' are forbidden in WGSL.]
    `);
  });

  it('forbids boolean expression statements', () => {
    const fn = () => {
      'use gpu';
      true;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'true;' are forbidden in WGSL.]
    `);
  });

  it('forbids identifier expression statements', () => {
    const fn = () => {
      'use gpu';
      const a = 1;
      a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a;' are forbidden in WGSL.]
    `);
  });

  it('forbids external identifier expression statements', () => {
    const a = 1;
    const fn = () => {
      'use gpu';
      a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a;' are forbidden in WGSL.]
    `);
  });

  it('forbids member access expression statements', () => {
    const Struct = d.struct({ p: d.u32 });
    const fn = () => {
      'use gpu';
      const a = Struct();
      a.p;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a.p;' are forbidden in WGSL.]
    `);
  });

  it('forbids complex expression statements', () => {
    const fn = () => {
      'use gpu';
      1 + 1;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot();
  });
});
