import { describe, expect, it } from 'vitest';
import { addArgTypesToExternals, type ExternalMap } from '../src/core/resolve/externals.ts';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';

// TODO: fix these tests
describe('addArgTypesToExternals', () => {
  const Particle = d.struct({
    position: d.vec3f,
    color: d.vec4f,
  });

  const Light = d.struct({
    ambient: d.vec4f,
    intensity: d.f32,
  });

  it('extracts struct argument types with their names', () => {
    const externals: ExternalMap[] = [];
    // addArgTypesToExternals(
    //   '(a: vec4f, b: Particle, c: Light) {}',
    //   [d.vec4f, Particle, Light],
    //   (result) => externals.push(result),
    // );
    // expect(externals).toStrictEqual([{ Particle, Light }]);
  });

  it('gets the names from argument list in WGSL implementation', () => {
    const externals: ExternalMap[] = [];
    // addArgTypesToExternals('(b: P, a: vec4f, c: L) -> L {}', [Particle, d.vec4f, Light], (result) =>
    //   externals.push(result),
    // );
    // expect(externals).toStrictEqual([{ P: Particle, L: Light }]);
  });

  it('works when builtins are present', () => {
    const externals: ExternalMap[] = [];
    // addArgTypesToExternals(
    //   '(@builtin(workgroup_id) WorkGroupID : vec3u, a: vec4f, b: Particle, c: Light) {}',
    //   [d.vec3u, d.vec4f, Particle, Light],
    //   (result) => externals.push(result),
    // );
    // expect(externals).toStrictEqual([{ Particle, Light }]);
  });

  it('works with unusual whitespace', () => {
    const externals: ExternalMap[] = [];
    //   addArgTypesToExternals(
    //     ` WorkGroupID : vec3u
    //     ,
    //       a   : A   ,
    //       (@builtin(workgroup_id) b

    // : B,

    //       c: C
    //     ) -> vec4f {}`,
    //     [d.vec3u, Particle, Particle, Particle],
    //     (result) => externals.push(result),
    //   );
    //   expect(externals).toStrictEqual([{ A: Particle, B: Particle, C: Particle }]);
  });
});

describe('external name collisions', () => {
  it("throws when rawWgsl fn has an 'Out' external", () => {
    const vertexFn = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })`{ return Out(); }`.$uses({ Out: d.struct({ prop: d.u32 }).$name('myOut') });

    expect(() => tgpu.resolve([vertexFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - vertexFn:vertexFn: Key 'Out' appears in externals while being reserved for internals. Please rename this external.]
    `);
  });

  it("allows an 'Out' external in TGSL implemented functions", () => {
    const Out = d.struct({ prop: d.u32 });
    const vertexFn = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })(() => {
      'use gpu';
      const out = Out();
      return { position: d.vec4f() };
    });

    expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
      "struct Out {
        prop: u32,
      }

      struct vertexFn_Output {
        @builtin(position) position: vec4f,
      }

      @vertex fn vertexFn() -> vertexFn_Output {
        let out = Out();
        return vertexFn_Output(vec4f());
      }"
    `);
  });

  it("throws when rawWgsl fn has an 'in' external", () => {
    const vertexFn = tgpu.vertexFn({
      in: { vId: d.builtin.vertexIndex },
      out: { position: d.builtin.position },
    })`{ return d.vec4f(in); }`.$uses({ in: 1 });

    expect(() => tgpu.resolve([vertexFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - vertexFn:vertexFn: Key 'in' appears in externals while being reserved for internals. Please rename this external.]
    `);
  });

  it("allows an 'in' external in TGSL implemented functions", () => {
    const EXT = { in: 1 };
    const vertexFn = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })(() => {
      'use gpu';
      const x = EXT.in;
      return { position: d.vec4f() };
    });

    expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
      "struct vertexFn_Output {
        @builtin(position) position: vec4f,
      }

      @vertex fn vertexFn() -> vertexFn_Output {
        const x = 1;
        return vertexFn_Output(vec4f());
      }"
    `);
  });
});
