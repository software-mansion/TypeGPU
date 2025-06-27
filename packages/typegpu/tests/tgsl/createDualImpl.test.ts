import { describe, expect, it } from 'vitest';
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

  it('returns a clone of its argument', () => {
    const dual = createDualImpl<(a: d.v3f) => d.v3f>(
      (a) => a,
      (snippet) => snippet,
      'myClone',
    );
    const vec = d.vec3f(1, 2, 3);

    const clonedVec = dual(vec);

    // console.dir(vec, { showHidden: true, depth: null });
    // console.dir(clonedVec, { showHidden: true, depth: null });

    expect(clonedVec).toStrictEqual(vec);
    expect(clonedVec).not.toBe(vec);
  });

  it('returns a deep clone of its argument', () => {
    const dual = createDualImpl<(a: { a: d.v2f }) => { a: d.v2f }>(
      (a) => a,
      (snippet) => snippet,
      'myClone',
    );
    const item = d.struct({ a: d.vec2f })({ a: d.vec2f(1, 2) });

    const clonedItem = dual(item);

    // console.dir(item, { showHidden: true, depth: null });
    // console.dir(clonedItem, { showHidden: true, depth: null });

    expect(clonedItem).toStrictEqual(item);
    expect(clonedItem).not.toBe(item);
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
