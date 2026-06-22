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
  it("throws when rawWgsl entrypoint has an 'Out' external", () => {
    const vertexFn = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })`{ return Out(); }`.$uses({ Out: d.struct({ prop: d.u32 }) });
    const fragmentFn = tgpu.fragmentFn({
      out: { color: d.location(0, d.vec4f) },
    })`{ return Out(); }`.$uses({ Out: d.struct({ prop: d.u32 }) });

    expect(() => tgpu.resolve([vertexFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - vertexFn:vertexFn: Key 'Out' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);

    expect(() => tgpu.resolve([fragmentFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fragmentFn:fragmentFn: Key 'Out' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);
  });

  it("allows an 'Out' external in TGSL implemented entrypoints", () => {
    const Out = d.struct({ prop: d.u32 });
    const vertexFn = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })(() => {
      'use gpu';
      const out = Out();
      return { position: d.vec4f() };
    });
    const fragmentFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      const out = Out();
      return d.vec4f();
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

    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "struct Out {
        prop: u32,
      }

      @fragment fn fragmentFn() -> @location(0) vec4f {
        let out = Out();
        return vec4f();
      }"
    `);
  });

  it("throws when rawWgsl entrypoint has an 'in' external", () => {
    const vertexFn = tgpu.vertexFn({
      in: { vId: d.builtin.vertexIndex },
      out: { position: d.builtin.position },
    })`{ return d.vec4f(in); }`.$uses({ in: 1 });
    const fragmentFn = tgpu.fragmentFn({
      in: { uv: d.vec2f },
      out: d.vec4f,
    })`{ return d.vec4f(in); }`.$uses({ in: 1 });
    const computeFn = tgpu.computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [1],
    })`{ let x = in; }`.$uses({ in: 1 });

    expect(() => tgpu.resolve([vertexFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - vertexFn:vertexFn: Key 'in' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);
    expect(() => tgpu.resolve([fragmentFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fragmentFn:fragmentFn: Key 'in' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);
    expect(() => tgpu.resolve([computeFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - computeFn:computeFn: Key 'in' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);
  });

  it("allows an 'in' external in TGSL implemented entrypoints", () => {
    const EXT = { in: 1 };
    const vertexFn = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })(() => {
      'use gpu';
      const x = EXT.in;
      return { position: d.vec4f() };
    });
    const fragmentFn = tgpu.fragmentFn({
      out: d.vec4f,
    })(() => {
      'use gpu';
      const x = EXT.in;
      return d.vec4f();
    });
    const computeFn = tgpu.computeFn({
      workgroupSize: [1],
    })(() => {
      'use gpu';
      const x = EXT.in;
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
    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "@fragment fn fragmentFn() -> @location(0) vec4f {
        const x = 1;
        return vec4f();
      }"
    `);
    expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(`
      "@compute @workgroup_size(1) fn computeFn() {
        const x = 1;
      }"
    `);
  });

  it('throws when rawWgsl fn has an external colliding with argument type', () => {
    const Schema = d.struct({ p: d.u32 });
    const myFn = tgpu.fn([Schema])`(a: S) { let b = S(); }`.$uses({ S: 1 });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Key 'S' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);
  });

  it('allows redundant external colliding with argument type', () => {
    const Schema = d.struct({ p: d.u32 });
    const myFn = tgpu.fn([Schema])`(a: S) { let b = S(); }`.$uses({ S: Schema });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Schema {
        p: u32,
      }

      fn myFn(a: Schema) { let b = Schema(); }"
    `);
  });

  it('throws when rawWgsl fn has an external colliding with return type', () => {
    const Schema = d.struct({ p: d.u32 });
    const myFn = tgpu.fn([], Schema)`() -> S { let a = S(); }`.$uses({ S: 1 });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Key 'S' appears in externals despite already being used for argument/return type. Please rename this external.]
    `);
  });

  it('allows redundant external colliding with return type', () => {
    const Schema = d.struct({ p: d.u32 });
    const myFn = tgpu.fn([], Schema)`() -> S { let a = S(); }`.$uses({ S: Schema });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Schema {
        p: u32,
      }

      fn myFn() -> Schema { let a = Schema(); }"
    `);
  });
});
