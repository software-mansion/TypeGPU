import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, it } from 'vitest';
import * as d from '../src/data';
import tgpu, { type TgpuBufferReadonly, wgsl } from '../src/experimental';
import type { ResolutionCtx } from '../src/experimental';

describe('tgpu resolve', () => {
  it('should resolve a string (identity)', () => {
    const mockCode = 'fn foo() { var v: Gradient; }';
    const resolved = tgpu.resolve(mockCode);
    expect(parse(resolved)).toEqual(parse(mockCode));
  });

  it('should resolve a list of strings', () => {
    const mockCode = [
      'fn foo() { var v: Gradient; }',
      'fn bar() { var v: Particle; }',
    ];
    const resolved = tgpu.resolve(mockCode);
    expect(parse(resolved)).toEqual(
      parse('fn foo() { var v: Gradient; } fn bar() { var v: Particle; }'),
    );
  });

  it('should resolve an external struct', () => {
    const Gradient = d.struct({
      from: d.vec3f,
      to: d.vec3f,
    });
    const resolved = tgpu.resolve('fn foo() { var g: Gradient; }', {
      Gradient,
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

      resolve(ctx: ResolutionCtx) {
        ctx.addDeclaration(
          wgsl`@group(0) @binding(0) var<uniform> intensity_1: f32;`,
        );
        return 'intensity_1';
      },
    } as TgpuBufferReadonly<d.F32>;

    const vertex = tgpu
      .vertexFn([], d.vec4f)
      .does(() => {
        const v = intensity.value;
        return d.vec4f(v, 0, 0, 1);
      })
      .$name('vertex');

    const fragment = tgpu
      .fragmentFn([], d.vec4f)
      .does(() => d.vec4f(intensity.value, 0, 0, 1))
      .$name('fragment');

    const resolved = tgpu.resolve([vertex, fragment]);

    expect(parse(resolved)).toEqual(
      parse(
        `@group(0) @binding(0) var<uniform> intensity_1: f32;
        @vertex fn vertex() -> vec4f {
          var v = intensity_1;
          return vec4f(v, 0, 0, 1);
        }
        @fragment fn fragment() -> vec4f {
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

    const killPlayer = tgpu
      .fn([PlayerData])
      .does((pInfo) => {
        pInfo.health = d.f32(0);
      })
      .$name('killPlayer_test');

    const shaderLogic = `
      @compute @workgroup_size(1)
      fn main() {
        var player: PlayerData;
        player.health = 100;
        killPlayer(player);
      }`;

    const resolved = tgpu.resolve([shaderLogic], { PlayerData, killPlayer });

    expect(parse(resolved)).toEqual(
      parse(`
        struct PlayerData {
          position: vec3f,
          velocity: vec3f,
          health: f32,
        }

        fn killPlayer_test(pInfo: PlayerData) {
          pInfo.health = f32(0);
        }

        @compute @workgroup_size(1)
        fn main() {
          var player: PlayerData;
          player.health = 100;
          killPlayer_test(player);
        }
      `),
    );
  });
});
