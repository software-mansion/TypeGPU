import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('tgpu resolve', () => {
  it('should resolve an external struct', () => {
    const Gradient = d.struct({
      start: d.vec3f,
      end: d.vec3f,
    });
    const resolved = tgpu.resolve({
      template: 'fn foo() { var g: Gradient; }',
      externals: {
        Gradient,
      },
      names: 'strict',
    });
    expect(resolved).toMatchInlineSnapshot(`
      "struct Gradient {
        start: vec3f,
        end: vec3f,
      }fn foo() { var g: Gradient; }"
    `);
  });

  it('should resolve a nested external JS struct', () => {
    const resolved = tgpu.resolve({
      template: 'fn foo() { var g = _EXT_.constants.n; }',
      externals: {
        _EXT_: {
          constants: {
            n: 1000,
          },
        },
      },
      names: 'strict',
    });
    expect(resolved).toMatchInlineSnapshot(`"fn foo() { var g = 1000; }"`);
  });

  it('properly resolves a combination of functions, structs and strings', () => {
    const PlayerData = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
      health: d.f32,
    });

    const getPlayerHealth = tgpu.fn(
      [PlayerData],
      d.f32,
    )((pInfo) => {
      return pInfo.health;
    });

    const resolved = tgpu.resolve({
      template: `
@compute @workgroup_size(1)
fn main() {
  var player: PlayerData;
  player.health = 100;
  let health = getPlayerHealth(player);
}
`,
      externals: {
        PlayerData,
        getPlayerHealth,
      },
      names: 'strict',
    });

    expect(resolved).toMatchInlineSnapshot(`
      "struct PlayerData {
        position: vec3f,
        velocity: vec3f,
        health: f32,
      }

      fn getPlayerHealth(pInfo: PlayerData) -> f32 {
        return pInfo.health;
      }
      @compute @workgroup_size(1)
      fn main() {
        var player: PlayerData;
        player.health = 100;
        let health = getPlayerHealth(player);
      }
      "
    `);
  });

  it('should resolve a function with its dependencies', () => {
    const Random = d.struct({
      seed: d.vec2f,
      range: d.vec2f,
    });

    const random = tgpu.fn([], d.f32)`() {
        var r: Random;
        r.seed = vec2<f32>(3.14, 1.59);
        r.range = vec2<f32>(0.0, 1.0);
        r.seed.x = fract(cos(dot(r.seed, vec2f(23.14077926, 232.61690225))) * 136.8168);
        r.seed.y = fract(cos(dot(r.seed, vec2f(54.47856553, 345.84153136))) * 534.7645);
        return clamp(r.seed.y, r.range.x, r.range.y);
      }`.$uses({ Random });

    const shaderLogic = `
      @compute @workgroup_size(1)
      fn main() {
        var value = randomTest();
      }`;

    const resolved = tgpu.resolve({
      template: shaderLogic,
      externals: { randomTest: random },
      names: 'strict',
    });

    expect(resolved).toMatchInlineSnapshot(`
      "struct Random {
        seed: vec2f,
        range: vec2f,
      }

      fn random() -> f32 {
              var r: Random;
              r.seed = vec2<f32>(3.14, 1.59);
              r.range = vec2<f32>(0.0, 1.0);
              r.seed.x = fract(cos(dot(r.seed, vec2f(23.14077926, 232.61690225))) * 136.8168);
              r.seed.y = fract(cos(dot(r.seed, vec2f(54.47856553, 345.84153136))) * 534.7645);
              return clamp(r.seed.y, r.range.x, r.range.y);
            }
            @compute @workgroup_size(1)
            fn main() {
              var value = random();
            }"
    `);
  });

  it('should resolve an unstruct to its corresponding struct', () => {
    const VertexInfo = d.unstruct({
      color: d.snorm8x4,
      colorHDR: d.unorm10_10_10_2,
      position2d: d.float16x2,
    });

    const resolved = tgpu.resolve({
      template: 'fn foo() { var v: VertexInfo; }',
      externals: { VertexInfo },
      names: 'strict',
    });

    expect(resolved).toMatchInlineSnapshot(`
      "struct VertexInfo {
        color: vec4f,
        colorHDR: vec4f,
        position2d: vec2f,

      }fn foo() { var v: VertexInfo; }"
    `);
  });

  it('should resolve an unstruct with a disarray to its corresponding struct', () => {
    const VertexInfo = d.unstruct({
      color: d.snorm8x4,
      colorHDR: d.unorm10_10_10_2,
      position2d: d.float16x2,
      extra: d.disarrayOf(d.snorm8x4, 16),
    });

    const resolved = tgpu.resolve({
      template: 'fn foo() { var v: VertexInfo; }',
      externals: { VertexInfo },
      names: 'strict',
    });

    expect(resolved).toMatchInlineSnapshot(`
      "struct VertexInfo {
        color: vec4f,
        colorHDR: vec4f,
        position2d: vec2f,
        extra: array<vec4f, 16>,

      }fn foo() { var v: VertexInfo; }"
    `);
  });

  it('should resolve an unstruct with a complex nested structure', () => {
    const Extra = d.unstruct({
      a: d.snorm8,
      b: d.snorm8x4,
      c: d.float16x2,
    });

    const More = d.unstruct({
      a: d.snorm8,
      b: d.snorm8x4,
    });

    const VertexInfo = d.unstruct({
      color: d.snorm8x4,
      colorHDR: d.unorm10_10_10_2,
      position2d: d.float16x2,
      extra: Extra,
      more: d.disarrayOf(More, 16),
    });

    const resolved = tgpu.resolve({
      template: 'fn foo() { var v: VertexInfo; }',
      externals: { VertexInfo },
      names: 'strict',
    });

    expect(resolved).toMatchInlineSnapshot(`
      "struct Extra {
        a: f32,
        b: vec4f,
        c: vec2f,

      }

      struct More {
        a: f32,
        b: vec4f,

      }

      struct VertexInfo {
        color: vec4f,
        colorHDR: vec4f,
        position2d: vec2f,
        extra: Extra,
        more: array<More, 16>,

      }fn foo() { var v: VertexInfo; }"
    `);
  });

  it('should resolve object externals and replace their usages in template', () => {
    const getColor = tgpu
      .fn(
        [],
        d.vec3f,
      )(`() -> vec3f {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const layout = tgpu.bindGroupLayout({
      intensity: { uniform: d.u32 },
    });

    const resolved = tgpu.resolve({
      template: `
      fn main () {
        let c = functions.getColor() * layout.$.intensity;
      }`,
      externals: {
        layout,
        functions: { getColor },
      },
      names: 'strict',
    });

    expect(resolved).toMatchInlineSnapshot(`
      "fn get_color() -> vec3f {
              let color = vec3f();
              return color;
            }

      @group(0) @binding(0) var<uniform> intensity: u32;
            fn main () {
              let c = get_color() * intensity;
            }"
    `);
  });

  it('should resolve only used object externals and ignore non-existing', () => {
    const getColor = tgpu.fn([], d.vec3f)`() {
      let color = vec3f();
      return color;
    }`;

    const getIntensity = tgpu.fn([], d.vec3f)`() {
      return 1;
    }`;

    const layout = tgpu.bindGroupLayout({
      intensity: { uniform: d.u32 },
    });

    const resolved = tgpu.resolve({
      template: `
      fn main () {
        let c = functions.getColor() * layout.$.intensity;
        let i = function.getWater();
      }`,
      externals: {
        layout,
        functions: { getColor, getIntensity },
      },
      names: 'strict',
    });

    expect(resolved).toContain('let i = function.getWater();');
    expect(resolved).not.toContain('get_intensity');
  });

  it('should resolve deeply nested objects', () => {
    expect(
      tgpu.resolve({
        template: 'fn main () { let x = a.b.c.d + a.e; }',
        externals: {
          a: {
            b: {
              c: {
                d: 2,
              },
            },
            e: 3,
          },
        },
        names: 'strict',
      }),
    ).toMatchInlineSnapshot(`"fn main () { let x = 2 + 3; }"`);
  });

  it('should treat dot as a regular character in regex when resolving object access externals and not a wildcard', () => {
    expect(
      tgpu.resolve({
        template: `
fn main () {
  let x = a.b;
  let y = axb;
}`,
        externals: {
          a: {
            b: 3,
          },
          axb: 2,
        },
        names: 'strict',
      }),
    ).toMatchInlineSnapshot(`
      "
      fn main () {
        let x = 3;
        let y = 2;
      }"
    `);
  });
});

describe('tgpu resolveWithContext', () => {
  it('should resolve a template with external values', () => {
    const Gradient = d.struct({
      start: d.vec3f,
      end: d.vec3f,
    });

    const { code } = tgpu.resolveWithContext({
      template: `
        fn getGradientAngle(gradient: Gradient) -> f32 {
          return atan(gradient.end.y - gradient.start.y, gradient.end.x - gradient.start.x);
        }
      `,
      externals: { Gradient },
      names: 'strict',
    });

    expect(code).toMatchInlineSnapshot(`
      "struct Gradient {
        start: vec3f,
        end: vec3f,
      }
              fn getGradientAngle(gradient: Gradient) -> f32 {
                return atan(gradient.end.y - gradient.start.y, gradient.end.x - gradient.start.x);
              }
            "
    `);
  });

  it('should resolve a template with additional config', () => {
    const configSpy = vi.fn((innerCfg) => innerCfg);

    const Voxel = d.struct({
      position: d.vec3f,
      color: d.vec4f,
    });
    const { code } = tgpu.resolveWithContext({
      template: `
          fn getVoxelColor(voxel: Voxel) -> vec4f {
            return voxel.color;
          }
        `,
      externals: { Voxel },
      names: 'strict',
      config: (cfg) => cfg.pipe(configSpy),
    });

    expect(code).toMatchInlineSnapshot(`
      "struct Voxel {
        position: vec3f,
        color: vec4f,
      }
                fn getVoxelColor(voxel: Voxel) -> vec4f {
                  return voxel.color;
                }
              "
    `);

    // verify resolveWithContext::config impl is being called
    expect(configSpy.mock.lastCall?.[0]).toBeDefined();
  });

  it('should resolve a template with a slot', () => {
    const configSpy = vi.fn((innerCfg) => innerCfg);

    const v = d.vec4f(1, 0, 1, 0);
    const colorSlot = tgpu.slot<d.v4f>();

    const Voxel = d.struct({
      position: d.vec3f,
      color: d.vec4f,
    });
    const { code } = tgpu.resolveWithContext({
      template: `
          fn getVoxelColor(voxel: Voxel) -> vec4f {
            return voxel.color * colorTint;
          }
        `,
      externals: { Voxel, colorTint: colorSlot },
      names: 'strict',
      config: (cfg) => cfg.with(colorSlot, v).pipe(configSpy),
    });

    expect(code).toMatchInlineSnapshot(`
      "struct Voxel {
        position: vec3f,
        color: vec4f,
      }
                fn getVoxelColor(voxel: Voxel) -> vec4f {
                  return voxel.color * vec4f(1, 0, 1, 0);
                }
              "
    `);
    // verify resolveWithContext::config impl is actually working
    expect(configSpy.mock.lastCall?.[0].bindings).toEqual([[colorSlot, v]]);
  });

  it('should warn when external is neither wgsl nor an object', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    tgpu.resolve({
      template: 'fn testFn() { var a = identity(1); return; }',
      externals: { identity: (a: number) => a },
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "During resolution, the external 'identity' has been omitted. Only TGPU resources, 'use gpu' functions, primitives, and plain JS objects can be used as externals.",
    );
  });

  it('should warn when the end of external chain was reached without a resolvable', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const getColor = tgpu.fn([])`() {
      let color = EXT.p.q;
    }`.$uses({ EXT: { p: { q: { r: d.vec3f() } } } });

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn getColor() {
            let color = EXT.p.q;
          }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "During resolution, the external 'EXT.p.q' has been omitted. Only TGPU resources, 'use gpu' functions, primitives, and plain JS objects can be used as externals.",
    );
  });

  it('should not warn when In/Out are unused', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    tgpu.resolve({
      template: 'fn testFn() { return; }',
      externals: {},
    });

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('does not resolve the same nested property twice', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const resolved = tgpu.resolve({
      template: 'fn testFn() { return _EXT_.n + _EXT_.n; }',
      externals: { _EXT_: { n: 100 } },
    });

    expect(resolved).toMatchInlineSnapshot(`"fn testFn() { return 100 + 100; }"`);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });
});

describe('resolve without template', () => {
  it('warns when using deprecated resolve API', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    tgpu.resolve({ externals: { Boid }, template: '' });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Calling resolve with an empty template is deprecated and will soon return an empty string. Consider using the 'tgpu.resolve(resolvableArray, options)' API instead.",
    );
  });

  it('resolves one item', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    expect(tgpu.resolve([Boid])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }"
    `);
  });

  it('resolves items with dependencies', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const myFn = tgpu.fn(
      [],
      Boid,
    )(() => {
      return Boid({ pos: d.vec2f(1, 2), vel: d.vec2f(3, 4) });
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn myFn() -> Boid {
        return Boid(vec2f(1, 2), vec2f(3, 4));
      }"
    `);
  });

  it('resolves multiple items', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
    const Player = d.struct({ hp: d.u32, str: d.f32 });

    expect(tgpu.resolve([Boid, Player])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      struct Player {
        hp: u32,
        str: f32,
      }"
    `);
  });

  it('does not duplicate dependencies', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const myFn1 = tgpu.fn(
      [],
      Boid,
    )(() => {
      return Boid({ pos: d.vec2f(1, 2), vel: d.vec2f(3, 4) });
    });

    const myFn2 = tgpu.fn(
      [],
      Boid,
    )(() => {
      return Boid({ pos: d.vec2f(10, 20), vel: d.vec2f(30, 40) });
    });

    expect(tgpu.resolve([myFn1, myFn2])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn myFn1() -> Boid {
        return Boid(vec2f(1, 2), vec2f(3, 4));
      }

      fn myFn2() -> Boid {
        return Boid(vec2f(10, 20), vec2f(30, 40));
      }"
    `);
  });

  it('resolves unnamed items', () => {
    expect(tgpu.resolve([d.struct({ pos: d.vec2f, vel: d.vec2f })])).toMatchInlineSnapshot(`
        "struct item {
          pos: vec2f,
          vel: vec2f,
        }"
      `);
  });
});

describe('tgpu resolveWithContext declarations', () => {
  it('reports each module-scope declaration with its resolved name', () => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3f,
    });

    const getSpeed = tgpu.fn([Boid], d.f32)((boid) => boid.vel.x);

    const isFast = tgpu.fn([Boid], d.bool)((boid) => getSpeed(boid) > 1);

    const { code, declarations } = tgpu.resolveWithContext([isFast], {
      names: 'strict',
    });

    expect(declarations.map((decl) => decl.name)).toEqual(['Boid', 'getSpeed', 'isFast']);
    // The code is exactly the declarations, joined.
    expect(declarations.map((decl) => decl.code).join('\n\n')).toBe(code);
  });

  it('does not include the template itself in declarations', () => {
    const Gradient = d.struct({
      start: d.vec3f,
      end: d.vec3f,
    });

    const { declarations } = tgpu.resolveWithContext({
      template: 'fn foo() { var g: Gradient; }',
      externals: { Gradient },
      names: 'strict',
    });

    expect(declarations.map((decl) => decl.name)).toEqual(['Gradient']);
  });

  it('reports only newly emitted declarations when sharing a namespace', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const getX = tgpu.fn([Boid], d.f32)((boid) => boid.pos.x);
    const getY = tgpu.fn([Boid], d.f32)((boid) => boid.pos.y);

    const names = tgpu['~unstable'].namespace();

    const first = tgpu.resolveWithContext([getX], { names });
    const second = tgpu.resolveWithContext([getY], { names });

    expect(first.declarations.map((decl) => decl.name)).toEqual(['Boid', 'getX']);
    // Boid is memoized in the namespace, so it is neither re-emitted nor re-reported.
    expect(second.declarations.map((decl) => decl.name)).toEqual(['getY']);
  });

  it('applies bind group indices to declaration code', () => {
    const layout = tgpu.bindGroupLayout({
      ambient: { uniform: d.vec3f },
    });

    const readAmbient = tgpu.fn([], d.vec3f)(() => layout.$.ambient);

    const { declarations } = tgpu.resolveWithContext([readAmbient], {
      names: 'strict',
    });

    const ambient = declarations.find((decl) => decl.name === 'ambient');
    expect(ambient?.code).toContain('@group(0)');
    expect(ambient?.code).not.toContain('#BIND_GROUP_LAYOUT');
  });
});
