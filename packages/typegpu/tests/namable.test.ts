import { describe, expect, it } from 'vitest';
import { ResolvableToStringError, StrictNameRegistry, wgsl } from '../src';
import { f32, struct, u32, vec3f } from '../src/data';
import { ResolutionCtxImpl } from '../src/resolutionCtx';
import { makeIdentifier } from '../src/wgslIdentifier';

global.GPUBufferUsage = {
  COPY_DST: 8,
  COPY_SRC: 4,
  INDEX: 16,
  INDIRECT: 256,
  MAP_READ: 1,
  MAP_WRITE: 2,
  QUERY_RESOLVE: 512,
  STORAGE: 128,
  UNIFORM: 64,
  VERTEX: 32,
};

describe('resolvable base', () => {
  it('throws an error when resolving wgsl items not in tagged functions', () => {
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    const slot = wgsl.slot(123).$name('slot');

    expect(() => ctx.resolve(`const something = ${slot};`)).toThrow(
      new ResolvableToStringError(slot),
    );

    const taggedResult = ctx.resolve(wgsl`const something = ${slot};`);
    expect(taggedResult).toEqual('const something = 123;');
  });

  it('allows logging wgsl item only through its debugRepr', () => {
    const variable = wgsl.var(u32, 123).$name('abc');

    expect(() => `${variable}`).toThrow(new ResolvableToStringError(variable));
    expect(`${variable.debugRepr}`).toEqual('var:abc');

    const fun = wgsl.fn`() -> u32 {
      return 1;
    }`.$name('def');

    expect(() => `${fun}`).toThrow(new ResolvableToStringError(fun));
    expect(`${fun.debugRepr}`).toEqual('fn:def');

    const slot = wgsl.slot(123).$name();

    expect(() => `${slot}`).toThrow(new ResolvableToStringError(slot));
    expect(`${slot.debugRepr}`).toEqual('slot:<unnamed>');

    const bufferUsage = wgsl
      .buffer(u32)
      .$allowMutable()
      .asMutable()
      .$name('ghi');

    expect(() => `${bufferUsage}`).toThrow(
      new ResolvableToStringError(bufferUsage),
    );
    expect(`${bufferUsage.debugRepr}`).toEqual('mutable:ghi');
  });

  it('makes items namable', () => {
    wgsl.var(u32, 123).$name('abc');
    wgsl.constant(123).$name('abc');
    wgsl.code`2+2`.$name('code');
    wgsl.slot(123).$name();
    wgsl.slot({ a: 'a' }).$name();
    wgsl.buffer(u32).$allowMutable().asMutable().$name('ghi');
    wgsl.buffer(u32).$name('ghi');
    makeIdentifier().$name('id');

    wgsl.fn`() -> u32 {
      return 1;
    }`.$name('def');

    wgsl
      .fun(
        [f32, u32],
        f32,
      )((one, two) => wgsl`${one} + ${two}`)
      .$name('def');

    struct({
      a: vec3f,
    }).$name('s');
  });

  it('allows debug logging bounded functions with labels of their parent functions', () => {
    const slot = wgsl.slot(123).$name('s');

    const fun = wgsl.fn`() -> u32 {
      return 1;
    }`.$name('def');

    const boundedFun = fun.with(slot, 246);
    expect(boundedFun.debugRepr).toEqual('fn:def[s=246]');
  });
});
