import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('atomic std builtins', () => {
  it('emits atomicExchange and atomicCompareExchangeWeak with typed results', () => {
    const i32Atomic = tgpu.workgroupVar(d.atomic(d.i32));
    const u32Atomic = tgpu.workgroupVar(d.atomic(d.u32));

    const testFn = tgpu.fn([])(() => {
      const oldI32 = std.atomicExchange(i32Atomic.$, 1);
      const resultI32 = std.atomicCompareExchangeWeak(i32Atomic.$, 1, 2);
      const oldU32 = std.atomicExchange(u32Atomic.$, 3);
      const resultU32 = std.atomicCompareExchangeWeak(u32Atomic.$, 3, 4);

      if (false) {
        expectTypeOf(oldI32).toEqualTypeOf<number>();
        expectTypeOf(resultI32.old_value).toEqualTypeOf<number>();
        expectTypeOf(resultI32.exchanged).toEqualTypeOf<boolean>();
        expectTypeOf(oldU32).toEqualTypeOf<number>();
        expectTypeOf(resultU32.old_value).toEqualTypeOf<number>();
        expectTypeOf(resultU32.exchanged).toEqualTypeOf<boolean>();
      }
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "var<workgroup> i32Atomic: atomic<i32>;

      var<workgroup> u32Atomic: atomic<u32>;

      fn testFn() {
        let oldI32 = atomicExchange(&i32Atomic, 1i);
        let resultI32 = atomicCompareExchangeWeak(&i32Atomic, 1i, 2i);
        let oldU32 = atomicExchange(&u32Atomic, 3u);
        let resultU32 = atomicCompareExchangeWeak(&u32Atomic, 3u, 4u);
      }"
    `);
  });

  it('emits workgroupUniformLoad for values and atomics', () => {
    const WorkgroupData = d.struct({ member: d.u32 });
    const value = tgpu.workgroupVar(d.vec4u);
    const composite = tgpu.workgroupVar(WorkgroupData);
    const counter = tgpu.workgroupVar(d.atomic(d.u32));

    const testFn = tgpu.fn([])(() => {
      const loadedValue = std.workgroupUniformLoad(value.$);
      const loadedMember = std.workgroupUniformLoad(composite.$.member);
      const loadedAtomic = std.workgroupUniformLoad(counter.$);

      if (false) {
        expectTypeOf(loadedValue).toEqualTypeOf<d.v4u>();
        expectTypeOf(loadedMember).toEqualTypeOf<number>();
        expectTypeOf(loadedAtomic).toEqualTypeOf<number>();
      }
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "var<workgroup> value: vec4u;

      struct WorkgroupData {
        member: u32,
      }

      var<workgroup> composite: WorkgroupData;

      var<workgroup> counter: atomic<u32>;

      fn testFn() {
        let loadedValue = workgroupUniformLoad(&value);
        let loadedMember = workgroupUniformLoad(&composite.member);
        let loadedAtomic = workgroupUniformLoad(&counter);
      }"
    `);
  });
});
