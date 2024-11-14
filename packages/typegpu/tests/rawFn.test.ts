import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, it } from 'vitest';
import { f32, vec3f } from '../src/data';
import tgpu, { wgsl } from '../src/experimental';
import { parseWGSL } from './utils/parseWGSL';

describe('tgpu.fn with raw string WGSL implementation', () => {
  it('is namable', () => {
    const getX = tgpu
      .fn([], f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves rawFn to WGSL', () => {
    const getY = tgpu
      .fn([], f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('get_y');

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn get_y() {
        return 3.0f;
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves externals and replaces their usages in code', () => {
    const getColor = tgpu
      .fn([], vec3f)
      .does(`() {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const getX = tgpu
      .fn([], f32)
      .does(`() {
        let color = get_color();
        return 3.0f;
      }`)
      .$name('get_x')
      .$uses({ get_color: getColor });

    const getY = tgpu
      .fn([], f32)
      .does(`() {
        let c = color();
        return getX();
      }`)
      .$name('get_y')
      .$uses({ getX, color: getColor });

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn get_color() {
        let color = vec3f();
        return color;
      }

      fn get_x() {
        let color = get_color();
        return 3.0f;
      }

      fn get_y() {
        let c = get_color();
        return get_x();
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('replaces external usage just for exact identifier matches', () => {
    const getx = tgpu
      .fn([], f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('external');

    const getY = tgpu
      .fn([], f32)
      .does(`() {
        let x = getx();
        let y = getx() + getx();
        let z = hellogetx();
        getx();
        xgetx();
        getxx();
        return getx();
      }`)
      .$name('get_y')
      .$uses({ getx });

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn external() {
        return 3.0f;
      }

      fn get_y() {
        let x = external();
        let y = external() + external();
        let z = hellogetx();
        external();
        xgetx();
        getxx();
        return external();
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });
});
