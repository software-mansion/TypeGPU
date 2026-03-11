import { describe, expectTypeOf } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';
import type { GPUValueOf } from '../src/shared/repr.ts';
import { it } from './utils/extendedIt.ts';

describe('GPUValueOf', () => {
  it('extracts value of tgpu.privateVar', () => {
    const foo = tgpu.privateVar(d.u32, 0);
    expectTypeOf<GPUValueOf<typeof foo>>().toEqualTypeOf<number>();
  });

  it('extracts value of tgpu.const', () => {
    const foo = tgpu.const(d.u32, 0);
    expectTypeOf<GPUValueOf<typeof foo>>().toEqualTypeOf<number>();
  });

  it('extracts value of buffer usages', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const usage = buffer.as('uniform');
    expectTypeOf<GPUValueOf<typeof usage>>().toEqualTypeOf<number>();
  });

  it('extracts value of slots', () => {
    const fooSlot = tgpu.slot(d.f32); // Holds a schema
    expectTypeOf<GPUValueOf<typeof fooSlot>>().toEqualTypeOf<d.F32>(); // Still a schema
  });
});
