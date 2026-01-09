import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('tgpu.fn with shell-less callback', () => {
  it('provides .with() method for binding accessors', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 2);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble4 = tgpu.fn([], d.f32)(getDouble);


    const main = () => {
      'use gpu';
      const foo = getDouble();
      return getDouble4();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 4f;
      }

      fn main() -> f32 {
        let foo = getDouble();
        return getDouble_1();
      }"
    `);
  }); 


  it('provides .with() method for binding accessors', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 2);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble4 = tgpu.fn([], d.f32)(getDouble);


    const main = () => {
      'use gpu';
      const foo = getDouble();
      return getDouble4();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 4f;
      }

      fn getDouble_1() -> f32 {
        return 4f;
      }

      fn main() -> f32 {
        let foo = getDouble();
        return getDouble_1();
      }"
    `);
  }); // jak przechodzi to kraksa

  it('provides .with() method for binding accessors', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 2);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble4 = tgpu.fn([], d.f32)(getDouble);
    const getDouble5 = tgpu.fn([], d.f32)(getDouble);

    const main = () => {
      'use gpu';
      const foo = getDouble();
      const boo = getDouble5();
      return getDouble4();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 4f;
      }

      fn getDouble_1() -> f32 {
        return 4f;
      }

      fn getDouble_2() -> f32 {
        return 4f;
      }

      fn main() -> f32 {
        let foo = getDouble();
        let boo = getDouble_1();
        return getDouble_2();
      }"
    `);
  }); // to tym bardziej

});
