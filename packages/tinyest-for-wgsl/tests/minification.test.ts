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

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"variable",[5,"1"]],[13,"other",[5,"2"]],[13,"sensitiveName",[5,"3"]]]]"`,
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

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"variable",[5,"1"]],[13,"other",[5,"2"]],[13,"sensitiveName",[5,"3"]]]]"`,
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

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"variable",[5,"1"]],[13,"other",[5,"2"]],[13,"sensitiveName",[5,"3"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
    }),
  );

  it(
    'does not minify struct params',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p('(param) => { const struct; return param.prop + struct.field; }'),
        true,
      );

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"variable",[5,"1"]],[13,"other",[5,"2"]],[13,"sensitiveName",[5,"3"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
    }),
  );
});
