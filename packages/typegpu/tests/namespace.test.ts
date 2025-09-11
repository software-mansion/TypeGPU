import { describe, expect } from 'vitest';
import tgpu from '../src/index.ts';
import * as d from '../src/data/index.ts';
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
      "struct Boid_0 {
        pos: vec3f,
      }var<private> foo: Boid_0"
    `);

    // Should be just the template, as Boid was already defined in the namespace
    expect(code2).toMatchInlineSnapshot(`"var<private> foo: Boid_0"`);
  });

  it('defines transitive dependencies only once', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const createBoid = tgpu.fn([], Boid)(() => {
      return Boid();
    });

    const updateBoid = tgpu.fn([d.ptrFn(Boid)])((boid) => {
      boid.pos.x += 1;
    });

    const names = tgpu['~unstable'].namespace();

    const code1 = tgpu.resolve({
      names,
      externals: { createBoid },
    });

    const code2 = tgpu.resolve({
      names,
      externals: { updateBoid },
    });

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid_1 {
        pos: vec3f,
      }

      fn createBoid_0() -> Boid_1 {
        return Boid_1();
      }"
    `);

    expect(code2).toMatchInlineSnapshot(`
      "fn updateBoid_2(boid: ptr<function, Boid_1>) {
        (*boid).pos.x += 1;
      }"
    `);
  });
});
