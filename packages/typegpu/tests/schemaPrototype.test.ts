import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';

describe('callable schemas', () => {
  it.each([
    ['d.struct', d.struct({ a: d.f32 })],
    ['d.arrayOf', d.arrayOf(d.f32, 2)],
    ['d.disarrayOf', d.disarrayOf(d.f32, 2)],
    ['d.unstruct', d.unstruct({ a: d.f32 })],
  ])('%s behaves like a regular JS function', (_, schema) => {
    expect(schema).toBeInstanceOf(Function);
    expect(typeof schema.call).toBe('function');
    expect(typeof schema.apply).toBe('function');
    expect(typeof schema.bind).toBe('function');
  });
});
