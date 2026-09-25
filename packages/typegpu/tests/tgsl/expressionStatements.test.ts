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
      - fn*:fn(): Expression statements like '1;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
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
      - fn*:fn(): Expression statements like 'true;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
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
      - fn*:fn(): Expression statements like 'a;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids external identifier expression statements', () => {
    const a = 'call()';
    const fn = () => {
      'use gpu';
      a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
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
      - fn*:fn(): Expression statements like 'a.p;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids unary expression statements', () => {
    const fn = () => {
      'use gpu';
      const a = 1;
      -a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '-a;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids logical expression statements', () => {
    const fn = () => {
      'use gpu';
      const a = true;
      a || false;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a || false;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids array expression statements', () => {
    const fn = () => {
      'use gpu';
      [1, 2, 3];
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '[1, 2, 3];' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids object expression statements', () => {
    const fn = () => {
      'use gpu';
      // oxlint-disable-next-line typegpu/no-unwrapped-objects
      ({ p: 1 });
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '{ p: 1 };' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids null literal statements', () => {
    const fn = () => {
      'use gpu';
      null;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'null;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids binary expression statements', () => {
    const fn = () => {
      'use gpu';
      1 + 1;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '1 + 1;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });
});
