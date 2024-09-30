import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, it } from 'vitest';
import { f32, vec3f } from '../src/data';
import tgpu, { wgsl } from '../src/experimental';
import { parseWGSL } from './utils/parseWGSL';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu
      .fn([], f32)
      .implement(() => {
        return 3;
      })
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves fn to WGSL', () => {
    const getY = tgpu
      .fn([], f32)
      .implement(() => {
        return 3;
      })
      .$name('get_y');

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn get_y() -> f32 {
        return 3;
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves externals', () => {
    const v = vec3f; // necessary workaround until we finish implementation of member access in the generator
    const getColor = tgpu
      .fn([], vec3f)
      .implement(() => {
        const color = v();
        return color;
      })
      .$uses({ v: vec3f })
      .$name('get_color');

    const getX = tgpu
      .fn([], f32)
      .implement(() => {
        const color = getColor();
        return 3;
      })
      .$name('get_x')
      .$uses({ getColor });

    const getY = tgpu
      .fn([], f32)
      .implement(() => {
        const c = getColor();
        return getX();
      })
      .$name('get_y')
      .$uses({ getX, getColor });

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn get_color() -> vec3f {
        let color = vec3f();
        return color;
      }

      fn get_x() -> f32 {
        let color = get_color();
        return 3;
      }

      fn get_y() -> f32 {
        let c = get_color();
        return get_x();
      }

      fn main() {
        let x = get_y();
      }
    `);

    

    expect(actual).toEqual(expected);
  });
});
