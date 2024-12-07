import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../../src/data';

describe('d.atomic', () => {
  it('creates a u32 atomic schema', () => {
    const u32Atomic = d.atomic(d.u32);

    expect(u32Atomic.type).toEqual('atomic');
    expect(u32Atomic.inner).toEqual(d.u32);
    expectTypeOf(u32Atomic).toEqualTypeOf<d.Atomic<d.U32>>();
  });

  it('creates an i32 atomic schema', () => {
    const i32Atomic = d.atomic(d.i32);

    expect(i32Atomic.type).toEqual('atomic');
    expect(i32Atomic.inner).toEqual(d.i32);
    expectTypeOf(i32Atomic).toEqualTypeOf<d.Atomic<d.I32>>();
  });

  it('accepts exotic u32 schemas, reduces type to common d.U32', () => {
    const exoticU32 = {
      type: 'u32' as const,
      '~repr': undefined as unknown as number,
      '~exotic': undefined as unknown as d.U32,
    };

    const u32Atomic = d.atomic(exoticU32);
    expectTypeOf(u32Atomic).toEqualTypeOf<d.Atomic<d.U32>>();
  });

  it('accepts exotic i32 schemas, reduces type to common d.I32', () => {
    const exoticI32 = {
      type: 'i32' as const,
      '~repr': undefined as unknown as number,
      '~exotic': undefined as unknown as d.I32,
    };

    const i32Atomic = d.atomic(exoticI32);
    expectTypeOf(i32Atomic).toEqualTypeOf<d.Atomic<d.I32>>();
  });
});

describe('d.isAtomic', () => {
  it('accepts native atomic schemas', () => {
    expect(d.isAtomic(d.atomic(d.u32))).toEqual(true);
    expect(d.isAtomic(d.atomic(d.i32))).toEqual(true);
  });

  it('accepts exotic atomic schemas', () => {
    const atomicU32 = d.atomic({
      type: 'u32',
      '~repr': undefined as unknown as number,
    });

    const atomicI32 = d.atomic({
      type: 'i32',
      '~repr': undefined as unknown as number,
    });

    expect(d.isAtomic(atomicU32)).toEqual(true);
    expect(d.isAtomic(atomicI32)).toEqual(true);
  });

  it('rejects other native schemas', () => {
    expect(d.isAtomic(d.u32)).toEqual(false);
    expect(d.isAtomic(d.f32)).toEqual(false);
  });
});
