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
        `"[0,[[13,"a",[5,"1"]],[13,"aa",[5,"2"]],[13,"aaa",[5,"3"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
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
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a",[5,"1"]],[10,"a"]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
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
            "name": "param1",
            "type": "i",
          },
          {
            "name": "param2",
            "type": "i",
          },
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[1,"param2","+","param1"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "param2",
          "param1",
        }
      `);
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
            "name": "param",
            "type": "i",
          },
        ]
      `);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[12,"a"],[10,[1,"param.prop","+",[7,"a","aa"]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "param.prop",
        }
      `);
    }),
  );
});
