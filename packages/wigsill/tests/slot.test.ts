import { describe, expect, it } from 'vitest';
import { MissingBindingError, StrictNameRegistry, wgsl } from '../src';
import { ResolutionCtxImpl } from '../src/resolutionCtx';

describe('wgsl.slot', () => {
  it('resolves to default value if no binding provided', () => {
    const colorSlot = wgsl.slot('vec3f(1., 0., 0.)').$name('color');
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    const program = wgsl`
      fn get_color() {
        return ${colorSlot};
      }`;

    expect(ctx.resolve(program)).toEqual(`
      fn get_color() {
        return vec3f(1., 0., 0.);
      }`);
  });

  it('resolves to binding rather than default value', () => {
    // red by default
    const colorSlot = wgsl.slot('vec3f(1., 0., 0.)').$name('color');
    const ctx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
      // overriding to green
      bindings: [[colorSlot, 'vec3f(0., 1., 0.)']],
    });

    const program = wgsl`
      fn get_color() {
        return ${colorSlot};
      }`;

    // should be green
    expect(ctx.resolve(program)).toEqual(`
      fn get_color() {
        return vec3f(0., 1., 0.);
      }`);
  });

  it('resolves to binding', () => {
    // no default
    const colorSlot = wgsl.slot<string>().$name('color');
    const ctx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
      // overriding to green
      bindings: [[colorSlot, 'vec3f(0., 1., 0.)']],
    });

    const program = wgsl`
      fn get_color() {
        return ${colorSlot};
      }`;

    // should be green
    expect(ctx.resolve(program)).toEqual(`
      fn get_color() {
        return vec3f(0., 1., 0.);
      }`);
  });

  it('throws error when no default nor binding provided', () => {
    const colorSlot = wgsl.slot().$name('color');
    const ctx = new ResolutionCtxImpl({ names: new StrictNameRegistry() });

    const shader = wgsl`
    fn get_color() {
      return ${colorSlot};
    }
    `;

    expect(() => ctx.resolve(shader)).toThrowError(
      new MissingBindingError(colorSlot),
    );
  });
});
