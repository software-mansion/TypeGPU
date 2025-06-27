import { describe, expect, it, test } from 'vitest';
import * as d from '../../src/data/index.ts';
import { createDualImpl } from '../../src/shared/generators.ts';
import { getName } from '../../src/shared/meta.ts';

describe('createDualImpl', () => {
  it('names functions created by createDualImpl', () => {
    const dual = createDualImpl(
      (a) => a,
      (snippet) => snippet,
      'myDualImpl',
    );
    expect(getName(dual)).toBe('myDualImpl');
  });

  test.each([
    [d.vec3f(1, 2, 3)],
    [d.vec4b(true, false, false, true)],
    [d.mat2x2f(1, 2, 3, 7)],
    [{ prop: d.vec2f(1, 2) }],
    [{ nested: { prop1: d.vec2f(1, 2), prop2: 21 } }],
    [[2, 3, 4]],
  ])('returns a deep clone of %o', (wgslObject) => {
    const dual = createDualImpl(
      (a: any) => a,
      (snippet) => snippet,
      'myClone',
    );

    const clone = dual(wgslObject);

    expect(clone).toStrictEqual(wgslObject);
    expect(clone).not.toBe(wgslObject);
  });

  it('does not modify its argument', () => {
    const dual = createDualImpl<(a: d.v3f) => d.v3f>(
      (a) => {
        a.x = 4;
        return a;
      },
      (snippet) => snippet,
      'myModify',
    );
    const vec = d.vec3f(1, 2, 3);

    const clonedVec = dual(vec);

    expect(vec).toStrictEqual(d.vec3f(1, 2, 3));
    expect(clonedVec).toStrictEqual(d.vec3f(4, 2, 3));
  });
});
