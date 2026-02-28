import { describe, expect, vi } from 'vitest';
import tgpu, { d } from '../src/index.js';
import { it } from './utils/extendedIt.ts';

describe('tgpu.namespace', () => {
  it('defines direct dependencies only once', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const names = tgpu['~unstable'].namespace();

    const code1 = tgpu.resolve({
      names,
      template: 'var<private> foo: Boid',
      externals: { Boid },
    });

    const code2 = tgpu.resolve({
      names,
      template: 'var<private> foo: Boid',
      externals: { Boid },
    });

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }var<private> foo: Boid"
    `);

    // Should be just the template, as Boid was already defined in the namespace
    expect(code2).toMatchInlineSnapshot(`"var<private> foo: Boid"`);
  });

  it('defines transitive dependencies only once', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const createBoid = tgpu.fn(
      [],
      Boid,
    )(() => {
      return Boid();
    });

    const updateBoid = tgpu.fn([d.ptrFn(Boid)])((boid) => {
      boid.$.pos.x += 1;
    });

    const names = tgpu['~unstable'].namespace();

    const code1 = tgpu.resolve([createBoid], { names });

    const code2 = tgpu.resolve([updateBoid], { names });

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }

      fn createBoid() -> Boid {
        return Boid();
      }"
    `);

    expect(code2).toMatchInlineSnapshot(`
      "fn updateBoid(boid: ptr<function, Boid>) {
        (*boid).pos.x += 1f;
      }"
    `);
  });

  it('fires "name" event', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const names = tgpu['~unstable'].namespace();

    const listener = vi.fn((event) => {});
    names.on('name', listener);

    const code = tgpu.resolve([Boid], { names });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ name: 'Boid', target: Boid });

    expect(code).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }"
    `);

    const code2 = tgpu.resolve([Boid], { names });

    // No more events
    expect(listener).toHaveBeenCalledTimes(1);
    expect(code2).toMatchInlineSnapshot(`""`);
  });

  it('handles name collision', () => {
    let code1: string, code2: string;
    const names = tgpu['~unstable'].namespace();
    {
      const Boid = d.struct({
        pos: d.vec3f,
      });
      const createBoid = tgpu.fn(
        [],
        Boid,
      )(() => {
        return Boid();
      });
      code1 = tgpu.resolve([createBoid], { names });
    }

    {
      const Boid = d.struct({
        pos: d.vec3i,
      });
      const createBoid = tgpu.fn(
        [],
        Boid,
      )(() => {
        return Boid();
      });
      code2 = tgpu.resolve([createBoid], { names });
    }

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }

      fn createBoid() -> Boid {
        return Boid();
      }"
    `);

    expect(code2).toMatchInlineSnapshot(`
      "struct Boid_1 {
        pos: vec3i,
      }

      fn createBoid_1() -> Boid_1 {
        return Boid_1();
      }"
    `);
  });
});
