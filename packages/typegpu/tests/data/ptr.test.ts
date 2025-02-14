import { describe, expect, expectTypeOf, it } from 'vitest';
import tgpu from '../../src';
import * as d from '../../src/data';

describe('d.ptrFn', () => {
  it('wraps a schema and infers type properly', () => {
    const ptrToU32 = d.ptrFn(d.u32);

    expectTypeOf(ptrToU32).toEqualTypeOf<
      d.Ptr<'function', d.U32, 'read-write'>
    >();
  });

  it('resolves to matching WGSL', () => {
    const ptrToU32 = d.ptrFn(d.u32);

    expect(
      tgpu.resolve({ externals: { ptrToU32 }, template: 'ptrToU32' }),
    ).toMatchInlineSnapshot(`"ptr<function, u32, read_write>"`);
  });
});
