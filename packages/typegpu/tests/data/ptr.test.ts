import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, tgpu } from '../../src/index.js';

describe('d.ptrFn', () => {
  it('wraps a schema and infers type properly', () => {
    const ptrToU32 = d.ptrFn(d.u32);

    expectTypeOf(ptrToU32).toEqualTypeOf<d.Ptr<'function', d.U32, 'read-write'>>();
  });

  it('resolves to matching WGSL', () => {
    const ptrToU32 = d.ptrFn(d.u32);

    expect(tgpu.resolve({ externals: { ptrToU32 }, template: 'ptrToU32' })).toMatchInlineSnapshot(
      `"ptr<function, u32>"`,
    );
  });

  it('modifies reference types in JS', () => {
    const modifyVec = tgpu.fn([d.ptrFn(d.vec2f)])((ptr) => {
      ptr.$.x += 1;
    });

    const testFn = tgpu.fn(
      [],
      d.vec2f,
    )(() => {
      const vec = d.ref(d.vec2f(1, 2));
      modifyVec(vec);
      return vec.$;
    });

    expect(testFn()).toStrictEqual(d.vec2f(2, 2));
  });
});

describe('d.ptrPrivate', () => {
  it('wraps a schema and infers type properly', () => {
    const ptrToU32 = d.ptrPrivate(d.u32);

    expectTypeOf(ptrToU32).toEqualTypeOf<d.Ptr<'private', d.U32, 'read-write'>>();
  });

  it('resolves to matching WGSL', () => {
    const ptrToU32 = d.ptrPrivate(d.u32);

    expect(tgpu.resolve({ externals: { ptrToU32 }, template: 'ptrToU32' })).toMatchInlineSnapshot(
      `"ptr<private, u32>"`,
    );
  });
});

describe('d.ptrStorage', () => {
  it('wraps a schema and infers type properly', () => {
    const ptrToU32 = d.ptrStorage(d.u32);

    expectTypeOf(ptrToU32).toEqualTypeOf<d.Ptr<'storage', d.U32, 'read'>>();

    const ptrToU32ReadWrite = d.ptrStorage(d.u32, 'read-write');

    expectTypeOf(ptrToU32ReadWrite).toEqualTypeOf<d.Ptr<'storage', d.U32, 'read-write'>>();
  });

  it('resolves to matching WGSL', () => {
    const ptrToU32 = d.ptrStorage(d.u32);

    expect(tgpu.resolve({ externals: { ptrToU32 }, template: 'ptrToU32' })).toMatchInlineSnapshot(
      `"ptr<storage, u32, read>"`,
    );
  });
});
