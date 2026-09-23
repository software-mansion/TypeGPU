import { describe, expect, it } from 'vitest';
import { dualTest, parseBabel, parseRollup } from './helpers.ts';
import { transpileAcornNode, transpileBabelNode } from '../src/parsers.ts';

describe('verbose nodes', () => {
  it(
    'uses nodes for identifiers',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`(a, b, c) => {
          return a + b + c;
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`
        [
          {
            "name": "a",
            "type": "i",
          },
          {
            "name": "b",
            "type": "i",
          },
          {
            "name": "c",
            "type": "i",
          },
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[1,[1,[9,"a"],"+",[9,"b"]],"+",[9,"c"]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'uses nodes for boolean literals',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          return true && false;
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[3,[107,true],"&&",[107,false]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'uses nodes for const declarations',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          const a = 1;
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[13,[9,"a"],[5,"1"]]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'uses nodes for let declarations',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          let a = 1;
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[12,[9,"a"],[5,"1"]]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'uses nodes for member expressions',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          const o = {};
          return o.prop;
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,[9,"o"],[104,{}]],[10,[7,[9,"o"],[9,"prop"]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'uses nodes for externals',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          return ext + ext.prop;
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[1,[9,"ext"],"+",[9,"ext.prop"]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`
        Map {
          "ext" => "ext",
          "ext.prop" => "ext.prop",
        }
      `);
    }),
  );

  it(
    'does not use nodes for object expression keys',
    dualTest((p, transpileFn) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          return { p: ext };
        }`),
        { verboseNodes: true },
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[10,[104,{"p":[9,"ext"]}]]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`
        Map {
          "ext" => "ext",
        }
      `);
    }),
  );

  it('generates verbose nodes in transpileBabelNode', () => {
    const ast = parseBabel('a || true');

    const body = transpileBabelNode(ast, { verboseNodes: true });

    expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[3,[9,"a"],"||",[107,true]]"`);
  });

  it('generates verbose nodes in transpileAcornNode', () => {
    const ast = parseRollup('a || true');

    const body = transpileAcornNode(ast, { verboseNodes: true });

    expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[3,[9,"a"],"||",[107,true]]"`);
  });
});
