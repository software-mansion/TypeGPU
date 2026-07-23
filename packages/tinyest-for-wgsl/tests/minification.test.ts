import babel from '@babel/parser';
import type { ClassDeclaration, ClassProperty, Expression, Node } from '@babel/types';
import * as acorn from 'acorn';
import { describe, expect, it } from 'vitest';
import { transpileFn } from '../src/parsers.ts';
import { dualTest } from './helpers.ts';

describe('transpileFn', () => {
  it(
    'minifies used variables',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('() => { const variable = 1; const other = 2; const sensitiveName = 3; }'),
        true,
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a",[5,"1"]],[13,"b",[5,"2"]],[13,"c",[5,"3"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'remembers minified names',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('() => { const variable = 1; return variable; }'),
        true,
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[13,"a",[5,"1"]],[10,"a"]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'minifies parameters',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('(param1, param2) => { return param2 + param1; }'),
        true,
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
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[10,[1,"b","+","a"]]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'minifies destructured parameters',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('(param, { prop }) => { return param + prop; }'),
        true,
      );

      expect(params).toMatchInlineSnapshot(`
        [
          {
            "name": "a",
            "type": "i",
          },
          {
            "props": [
              {
                "alias": "b",
                "name": "prop",
              },
            ],
            "type": "d",
          },
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[10,[1,"a","+","b"]]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'minifies destructured parameters with aliases',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('(param, { prop, other: alias }) => { return param + prop + alias; }'),
        true,
      );

      expect(params).toMatchInlineSnapshot(`
        [
          {
            "name": "a",
            "type": "i",
          },
          {
            "props": [
              {
                "alias": "b",
                "name": "prop",
              },
              {
                "alias": "c",
                "name": "other",
              },
            ],
            "type": "d",
          },
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[1,[1,"a","+","b"],"+","c"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'does not minify struct params',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('(param) => { let struct; return param.prop + struct.field; }'),
        true,
      );

      expect(params).toMatchInlineSnapshot(`
        [
          {
            "name": "a",
            "type": "i",
          },
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[12,"b"],[10,[1,[7,"a","prop"],"+",[7,"b","field"]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    "minifies 'this'",
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => { return this.prop1.prop2; }`),
        true,
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[10,"a"]]]"`);
      expect(externalNames).toMatchInlineSnapshot(`
        Map {
          "a" => "this.prop1.prop2",
        }
      `);
    }),
  );

  it(
    'minifies externals',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
          const var1 = ext.value;
          const var2 = ext.config.multiplier;
          const var3 = ext.config.zero;
          const var4 = ext.config.multiplier;
        }`),
        true,
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a","b"],[13,"c","d"],[13,"e","f"],[13,"g","d"]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`
        Map {
          "b" => "ext.value",
          "d" => "ext.config.multiplier",
          "f" => "ext.config.zero",
        }
      `);
    }),
  );

  // TODO: shadowing

  it(
    'supports more than 26 names',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => { ${Array.from({ length: 100 }, (_, i) => `let v${i};`).join('\n')} }`),
        true,
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      const stringifiedBody = JSON.stringify(body);
      expect(stringifiedBody).toContain('z');
      expect(stringifiedBody).toContain('aa');
      expect(stringifiedBody).toContain('ab');
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'omits reserved words',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => { ${Array.from({ length: 26 + 26 * 26 }, (_, i) => `let v${i};`).join('\n')} }`),
        true,
      );

      expect(params).toMatchInlineSnapshot(`[]`);
      const stringifiedBody = JSON.stringify(body);
      expect(stringifiedBody).not.toContain('if');
      expect(stringifiedBody).toContain('aaa');
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
    }),
  );
});
