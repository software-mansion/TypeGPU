import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { setName } from '../src/shared/meta.ts';
import { $wgslDataType } from '../src/shared/symbols.ts';
import type { ResolutionCtx } from '../src/types.ts';
import { parse } from './utils/parseResolved.ts';

describe('tgpu resolve', () => {
  it('should resolve an external struct', () => {
    const Gradient = d.struct({
      from: d.vec3f,
      to: d.vec3f,
    });
    const resolved = tgpu.resolve({
      template: 'fn foo() { var g: Gradient; }',
      externals: {
        Gradient,
      },
      names: 'strict',
    });
    expect(parse(resolved)).toBe(
      parse(
        'struct Gradient { from: vec3f, to: vec3f, } fn foo() { var g: Gradient; }',
      ),
    );
  });

  it('should deduplicate dependencies', () => {
    const intensity = {
      get value(): number {
        return {
          [$wgslDataType]: d.f32,
          '~resolve'(ctx: ResolutionCtx) {
            return ctx.resolve(intensity);
          },
        } as unknown as number;
      },

      '~resolve'(ctx: ResolutionCtx) {
        const name = ctx.names.makeUnique('intensity');
        ctx.addDeclaration(
          `@group(0) @binding(0) var<uniform> ${name}: f32;`,
        );
        return name;
      },
    };
    setName(intensity, 'intensity');

    const fragment1 = tgpu['~unstable']
      .fragmentFn({ out: d.vec4f })(() => d.vec4f(0, intensity.value, 0, 1))
      .$name('fragment1');

    const fragment2 = tgpu['~unstable']
      .fragmentFn({ out: d.vec4f })(() => d.vec4f(intensity.value, 0, 0, 1))
      .$name('fragment2');

    const resolved = tgpu.resolve({
      externals: { fragment1, fragment2 },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(
        `@group(0) @binding(0) var<uniform> intensity: f32;
        @fragment fn fragment1() -> @location(0) vec4f {
          return vec4f(0, intensity, 0, 1);
        }
        @fragment fn fragment2() -> @location(0) vec4f {
          return vec4f(intensity, 0, 0, 1);
        }`,
      ),
    );
  });

  it('properly resolves a combination of functions, structs and strings', () => {
    const PlayerData = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
      health: d.f32,
    });

    const getPlayerHealth = tgpu.fn([PlayerData], d.f32)((pInfo) => {
      return pInfo.health;
    })
      .$name('getPlayerHealthTest');

    const shaderLogic = `
      @compute @workgroup_size(1)
      fn main() {
        var player: PlayerData;
        player.health = 100;
        let health = getPlayerHealth(player);
      }`;

    const resolved = tgpu.resolve({
      template: shaderLogic,
      externals: {
        PlayerData,
        getPlayerHealth,
      },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        struct PlayerData {
          position: vec3f,
          velocity: vec3f,
          health: f32,
        }

        fn getPlayerHealthTest(pInfo: PlayerData) -> f32 {
          return pInfo.health;
        }

        @compute @workgroup_size(1)
        fn main() {
          var player: PlayerData;
          player.health = 100;
          let health = getPlayerHealthTest(player);
        }
      `),
    );
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
      }`
      .$uses({ Random });

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

    expect(parse(resolved)).toBe(
      parse(`
        struct Random {
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
        }
      `),
    );
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

    expect(parse(resolved)).toBe(
      parse(`
        struct VertexInfo {
          color: vec4f,
          colorHDR: vec4f,
          position2d: vec2f,
        }
        fn foo() { var v: VertexInfo; }
      `),
    );
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

    expect(parse(resolved)).toBe(
      parse(`
        struct VertexInfo {
          color: vec4f,
          colorHDR: vec4f,
          position2d: vec2f,
          extra: array<vec4f, 16>,
        }
        fn foo() { var v: VertexInfo; }
      `),
    );
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

    expect(parse(resolved)).toBe(
      parse(`
        struct Extra {
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
        }

        fn foo() { var v: VertexInfo; }
      `),
    );
  });

  it('should resolve object externals and replace their usages in template', () => {
    const getColor = tgpu.fn([], d.vec3f)(`() -> vec3f {
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
        let c = functions.getColor() * layout.bound.intensity;
      }`,
      externals: {
        layout,
        functions: { getColor },
      },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
      @group(0) @binding(0) var<uniform> intensity: u32;

      fn get_color() -> vec3f {
        let color = vec3f();
        return color;
      }

      fn main() {
        let c = get_color() * intensity;
      }
    `),
    );
  });

  it('should resolve only used object externals and ignore non-existing', () => {
    const getColor = tgpu.fn([], d.vec3f)(`() -> vec3f {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const getIntensity = tgpu.fn([], d.vec3f)(`() -> vec3f {
        return 1;
      }`)
      .$name('get_intensity');

    const layout = tgpu.bindGroupLayout({
      intensity: { uniform: d.u32 },
    });

    const resolved = tgpu.resolve({
      template: `
      fn main () {
        let c = functions.getColor() * layout.bound.intensity;
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
      parse(
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
      ),
    ).toBe(parse('fn main() { let x = 2 + 3; }'));
  });

  it('should treat dot as a regular character in regex when resolving object access externals and not a wildcard', () => {
    expect(
      parse(
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
      ),
    ).toBe(
      parse(`
        fn main () {
          let x = 3;
          let y = 2;
        }`),
    );
  });
});
