import { describe, expect, it } from 'vitest';
import * as tinyest from 'tinyest';
import { d, std } from 'typegpu';
import { reviveFunction } from '../../src/shared/revive.ts';
import type { INTERNAL_GlobalExt } from '../../src/shared/meta.ts';
import type { RawMetadataV3 } from '../../src/shared/normalizeMetadata.ts';

const NODE = tinyest.NodeTypeCatalog;

function withMetadata(meta: RawMetadataV3) {
  const fn = () => {};
  ((globalThis as INTERNAL_GlobalExt).__TYPEGPU_META__ ??= new WeakMap()).set(fn, meta);
  return fn;
}

describe('reviveFunction', () => {
  it('recreates a function from its AST', () => {
    const config = { scale: 2, nested: { offset: d.vec2f(1, -1) } };
    // (pos, vel) => { 'use gpu'; const v = vel * config.scale; return pos + v * 0.5 + config.nested.offset; }
    const fn = withMetadata([
      JSON.stringify([
        ['pos', 'vel'],
        [
          [NODE.const, 'v', [NODE.binaryExpr, 'vel', '*', 'config.scale']],
          [
            NODE.return,
            [
              NODE.binaryExpr,
              [NODE.binaryExpr, 'pos', '+', [NODE.binaryExpr, 'v', '*', 0.5]],
              '+',
              'config.nested.offset',
            ],
          ],
        ],
      ]),
      {
        'config.scale': () => config.scale,
        'config.nested.offset': () => config.nested.offset,
      },
    ]);

    const revived = reviveFunction(fn);
    expect(revived(d.vec2f(1, 2), d.vec2f(0.5, -0.25))).toStrictEqual(d.vec2f(2.5, 0.75));
  });

  it('supports destructured params, loops and compound assignment', () => {
    // ({ a, b: count }) => { 'use gpu'; let acc = 0; for (let i = 0; i < count; i++) { acc += std.max(a, i); } return acc; }
    const fn = withMetadata([
      JSON.stringify([
        [
          [
            ['a', 'a'],
            ['b', 'count'],
          ],
        ],
        [
          [NODE.let, 'acc', 0],
          [
            NODE.for,
            [NODE.let, 'i', 0],
            [NODE.binaryExpr, 'i', '<', 'count'],
            [NODE.postUpdate, '++', 'i'],
            [NODE.block, [[NODE.assignmentExpr, 'acc', '+=', [NODE.call, 'std.max', ['a', 'i']]]]],
          ],
          [NODE.return, 'acc'],
        ],
      ]),
      { 'std.max': () => std.max },
    ]);

    expect(reviveFunction(fn)({ a: 2, b: 4 })).toBe(2 + 2 + 2 + 3);
  });

  it('throws for functions without metadata', () => {
    expect(() => reviveFunction(() => {})).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot recreate a function without metadata]`,
    );
  });
});
