import { describe, expect, it } from 'vitest';
import { dualTest, parseBabel, parseRollup } from './helpers.ts';
import type { SourceMap } from 'tinyest';
import { transpileAcornNode, transpileBabelFn, transpileBabelNode } from '../src/parsers.ts';

function stringifyMap(map: SourceMap) {
  return [...map.entries()].map(([key, value]) => `${JSON.stringify(key)} => ${value} `).join('\n');
}

describe('source map', () => {
  it(
    'leaves source map empty when not provided',
    dualTest((p, transpileFn) => {
      const { sourceMap } = transpileFn(
        p(`() => {
          const x = 2 + 2 * 2;
        }`),
      );

      expect(sourceMap.size).toBe(0);
    }),
  );

  it(
    'leaves source map empty when provided map returns undefined',
    dualTest((p, transpileFn) => {
      const { sourceMap } = transpileFn(
        p(`() => {
          const x = 2 + 2 * 2;
        }`),
        { sourceMap: () => undefined },
      );

      expect(sourceMap.size).toBe(0);
    }),
  );

  it(
    'uses provided values',
    dualTest((p, transpileFn) => {
      const { sourceMap } = transpileFn(p(`() => { }`), { sourceMap: () => [6, 7] });

      expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`"[0,[]] => 6,7 "`);
    }),
  );

  it(
    'properly passes nodes',
    dualTest((p, transpileFn) => {
      const typeToNum = {
        BlockStatement: 10,
        VariableDeclaration: 11,
        Identifier: 12,
        BinaryExpression: 13,
        NumericLiteral: 14,
        Literal: 14,
      };

      let index = 0;
      const { params, externalNames, body, sourceMap } = transpileFn(
        p(`() => {
          const x = 2 + 2 * 2;
        }`),
        { sourceMap: (node) => [++index, typeToNum[node.type as keyof typeof typeToNum]] },
      );

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
      expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`
        "[5,"2"] => 1,14 
        [5,"2"] => 2,14 
        [5,"2"] => 3,14 
        [1,[5,"2"],"*",[5,"2"]] => 4,13 
        [1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]] => 5,13 
        [13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]] => 6,11 
        [0,[[13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]]]] => 7,10 "
      `);
    }),
  );

  it(
    'maps body-less functions',
    dualTest((p, transpileFn) => {
      const { sourceMap } = transpileFn(p(`() => 1 + 2;`), {
        verboseNodes: true,
        sourceMap: () => [4, 2],
      });

      expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`
        "[5,"1"] => 4,2 
        [5,"2"] => 4,2 
        [1,[5,"1"],"+",[5,"2"]] => 4,2 "
      `);
    }),
  );

  it(
    'maps array identifiers',
    dualTest((p, transpileFn) => {
      const { sourceMap } = transpileFn(p(`() => { let a; }`), {
        verboseNodes: true,
        sourceMap: (node) => (node.type === 'Identifier' ? [4, 2] : undefined),
      });

      expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`"[9,"a"] => 4,2 "`);
    }),
  );

  it(
    'maps external chains',
    dualTest((p, transpileFn) => {
      const { sourceMap } = transpileFn(p(`() => { ext.p; }`), {
        verboseNodes: true,
        sourceMap: (node) => (node.type === 'MemberExpression' ? [4, 2] : undefined),
      });

      expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`"[9,"ext.p"] => 4,2 "`);
    }),
  );
  it('does not accept source map in transpileBabelNode', () => {
    const node = parseBabel('() => {}');

    // @ts-expect-error
    () => transpileBabelNode(node, { sourceMap: () => undefined });
  });

  it('does not accept source map in transpileAcornNode', () => {
    const node = parseRollup('() => {}');

    // @ts-expect-error
    () => transpileAcornNode(node, { sourceMap: () => undefined });
  });

  it('assigns correct source map when ts types are present', () => {
    const node = parseBabel('() => (ext as T1);');
    const { sourceMap } = transpileBabelFn(node, {
      verboseNodes: true,
      sourceMap: (node) => {
        if (node.type === 'Identifier') {
          return [1, 1];
        }
        return [2, 2];
      },
    });

    expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`"[9,"ext"] => 1,1 "`);
  });
});
