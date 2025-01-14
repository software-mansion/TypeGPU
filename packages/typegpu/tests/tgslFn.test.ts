import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import { fn } from '../src/core/function/tgpuFn';
import { f32, vec3f } from '../src/data';
import { parseResolved } from './utils/parseResolved';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu['~unstable']
      .fn([], f32)
      .does(() => {
        return 3;
      })
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves fn to WGSL', () => {
    const getY = fn([], f32)
      .does(() => {
        return 3;
      })
      .$name('getY');

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn getY() -> f32 {
        return 3;
      }`);

    expect(actual).toEqual(expected);
  });

  it('resolves externals', () => {
    const v = vec3f; // necessary workaround until we finish implementation of member access in the generator
    const getColor = fn([], vec3f)
      .does(() => {
        const color = v();
        const color2 = v(1, 2, 3);
        return color;
      })
      .$uses({ v: vec3f })
      .$name('get_color');

    const getX = fn([], f32)
      .does(() => {
        const color = getColor();
        return 3;
      })
      .$name('get_x')
      .$uses({ getColor });

    const getY = fn([], f32)
      .does(() => {
        const c = getColor();
        return getX();
      })
      .$name('getY')
      .$uses({ getX, getColor });

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn get_color() -> vec3f {
        var color = vec3f();
        var color2 = vec3f(1, 2, 3);
        return color;
      }

      fn get_x() -> f32 {
        var color = get_color();
        return 3;
      }

      fn getY() -> f32 {
        var c = get_color();
        return get_x();
      }
    `);

    expect(actual).toEqual(expected);
  });
});
