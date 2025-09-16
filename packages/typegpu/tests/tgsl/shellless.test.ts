import { describe, expect } from 'vitest';
import tgpu from '../../src/index.ts';
import * as d from '../../src/data/index.ts';
import * as std from '../../src/std/index.ts';
import { it } from '../utils/extendedIt.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('shellless', () => {
  it('is callable from shelled function', () => {
    type vf = d.v2f | d.v3f | d.v4f;

    const dot2 = (a: vf, b: vf) => {
      'kernel';
      return std.dot(a, b) * 2;
    };

    const main = tgpu.fn([], d.f32)(() => {
      const a = d.vec2f(1, 2);
      const b = d.vec2f(3, 4);
      return dot2(a, b);
    });

    expect(asWgsl(main)).toMatchInlineSnapshot();
  });
});
