import { describe, expect, it } from 'vitest';
import { StrictNameRegistry, wgsl } from '../src';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('resolving errors', () => {
  it('throws errors when resolving wgsl items not in tagged functions', () => {
    const valueSlot = wgsl.slot(123).$name('value');
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    expect(() => ctx.resolve(`const something = ${valueSlot};`)).toThrow();

    const taggedResult = ctx.resolve(wgsl`const something = ${valueSlot};`);
    expect(taggedResult).toEqual('const something = 123;');
  });
});
