import { describe, expect, vi, it } from 'vitest';
import { d } from 'typegpu';
import { getCustomSize } from '../../src/data/dataTypes.ts';
import { getLayoutInfo } from '../../src/data/schemaMemoryLayout.ts';

vi.mock('../../src/data/dataTypes.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/data/dataTypes.ts')>();
  return { ...original, getCustomSize: vi.fn(original.getCustomSize) };
});

describe('getLayoutInfo', () => {
  it('computes the layout of each nested schema only once', () => {
    const Inner = d.struct({ value: d.size(8, d.f32) });
    const Outer = d.struct({ a: Inner, b: Inner });
    const Schema = d.arrayOf(Outer, 2);

    expect(getLayoutInfo(Schema, 'size')).toBe(32);
    expect(getLayoutInfo(Outer, 'size')).toBe(16);
    expect(getLayoutInfo(Inner, 'size')).toBe(8);
    expect(getCustomSize).toHaveBeenCalledTimes(1);
  });
});
