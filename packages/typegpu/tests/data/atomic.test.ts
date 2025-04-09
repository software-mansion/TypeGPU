import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../../src/data/index.ts';

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
});

describe('d.isAtomic', () => {
  it('accepts atomic schemas', () => {
    expect(d.isAtomic(d.atomic(d.u32))).toEqual(true);
    expect(d.isAtomic(d.atomic(d.i32))).toEqual(true);
  });

  it('rejects other schemas', () => {
    expect(d.isAtomic(d.u32)).toEqual(false);
    expect(d.isAtomic(d.f32)).toEqual(false);
  });
});
