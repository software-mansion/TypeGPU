import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import * as d from '../src/data';
import tgpu, { type TgpuBufferReadonly } from '../src/experimental';
import type { ResolutionCtx } from '../src/types';

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
    expect(parse(resolved)).toEqual(
      parse(
        'struct Gradient { from: vec3f, to: vec3f, } fn foo() { var g: Gradient; }',
      ),
    );
  });

  it('should deduplicate dependencies', () => {
    const intensity = {
      label: 'intensity',

      get value() {
        return this;
      },

      '~resolve'(ctx: ResolutionCtx) {
        ctx.addDeclaration(
          '@group(0) @binding(0) var<uniform> intensity_1: f32;',
        );
        return 'intensity_1';
      },
    } as unknown as TgpuBufferReadonly<d.F32>;

    const fragment1 = tgpu
      .fragmentFn({}, d.vec4f)
      .does(() => d.vec4f(0, intensity.value, 0, 1))
      .$name('fragment1');

    const fragment2 = tgpu
      .fragmentFn({}, d.vec4f)
      .does(() => d.vec4f(intensity.value, 0, 0, 1))
      .$name('fragment2');

    const resolved = tgpu.resolve({
      externals: { fragment1, fragment2 },
      names: 'strict',
    });

    expect(parse(resolved)).toEqual(
      parse(
        `@group(0) @binding(0) var<uniform> intensity_1: f32;
        @fragment fn fragment1() -> vec4f {
          return vec4f(0, intensity_1, 0, 1);
        }
        @fragment fn fragment2() -> vec4f {
          return vec4f(intensity_1, 0, 0, 1);
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

    const getPlayerHealth = tgpu
      .fn([PlayerData], d.f32)
      .does((pInfo) => {
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

    expect(parse(resolved)).toEqual(
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

    const random = tgpu
      .fn([], d.f32)
      .does(/* wgsl */ `() -> f32 {
        var r: Random;
        r.seed = vec2<f32>(3.14, 1.59);
        r.range = vec2<f32>(0.0, 1.0);
        r.seed.x = fract(cos(dot(r.seed, vec2f(23.14077926, 232.61690225))) * 136.8168);
        r.seed.y = fract(cos(dot(r.seed, vec2f(54.47856553, 345.84153136))) * 534.7645);
        return clamp(r.seed.y, r.range.x, r.range.y);
      }`)
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

    expect(parse(resolved)).toEqual(
      parse(`
        struct Random {
          seed: vec2f,
          range: vec2f,
        }

        fn randomTest() -> f32 {
          var r: Random;
          r.seed = vec2<f32>(3.14, 1.59);
          r.range = vec2<f32>(0.0, 1.0);
          r.seed.x = fract(cos(dot(r.seed, vec2f(23.14077926, 232.61690225))) * 136.8168);
          r.seed.y = fract(cos(dot(r.seed, vec2f(54.47856553, 345.84153136))) * 534.7645);
          return clamp(r.seed.y, r.range.x, r.range.y);
        }

        @compute @workgroup_size(1)
        fn main() {
          var value = randomTest();
        }
      `),
    );
  });

  it('should resolve object externals and replace their usages in template', () => {
    const getColor = tgpu
      .fn([], d.vec3f)
      .does(`() {
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

    expect(parse(resolved)).toEqual(
      parse(`
      @group(0) @binding(0) var<uniform> intensity: u32;

      fn get_color() {
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
    const getColor = tgpu
      .fn([], d.vec3f)
      .does(`() {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const getIntensity = tgpu
      .fn([], d.vec3f)
      .does(`() {
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
    ).toEqual(parse('fn main() { let x = 2 + 3; }'));
  });
});
