import { describe, expect, test } from 'vitest';
import { babelTransform, rollupTransform, type BabelTestPlugin } from './transform.ts';
import * as t from '@babel/types';
import type { Plugin } from 'rollup';
import * as parser from '@babel/parser';
import traverse, { type TraverseOptions } from '@babel/traverse';
import MagicString from 'magic-string';
import { getBabelParserOptions, getLang } from 'ast-kit';

describe('source maps', () => {
  describe('assigns source maps metadata', () => {
    const code = `\
      import { tgpu } from 'typegpu';

      const external = { n: 1 }

      export const fn = (argument) => {
        'use gpu';
        const variable = 3;
        return external.n + argument + variable;
      };`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { unstable_sourceMaps: true })).toMatchInlineSnapshot(`
        "import { tgpu } from 'typegpu';
        const external = {
          n: 1
        };
        export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = argument => {
          'use gpu';

          const variable = 3;
          return __tsover_add(__tsover_add(external.n, argument), variable);
        }, {
          v: 2,
          name: "fn",
          ast: {
            params: [{
              type: "i",
              name: "argument"
            }],
            body: [0, [[13, "variable", [5, "3"]], [10, [1, [1, "external.n", "+", "argument"], "+", "variable"]]]]
          },
          externals: {
            "external.n": () => external.n
          },
          sourceMap: {
            path: "TODO",
            entries: [[5, 38], [7, 8], [7, 14], [7, 25], [8, 8], [8, 15], [8, 15], [8, 15], [8, 28], [8, 39]]
          }
        }) && $.f)({});"
      `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { unstable_sourceMaps: true })).toMatchInlineSnapshot(`
        "import 'typegpu';

        const external = { n: 1 };

              const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((argument) => {
                'use gpu';
                const variable = 3;
                return __tsover_add(__tsover_add(external.n, argument), variable);
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[{"type":"i","name":"argument"}],"body":[0,[[13,"variable",[5,"3"]],[10,[1,[1,"external.n","+","argument"],"+","variable"]]]]},
            externals: {"external.n":() => external.n},
            sourceMap: {"path":"TODO","entries":[[5,38],[7,8],[7,14],[7,25],[8,8],[8,15],[8,15],[8,15],[8,28],[8,39]]}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });

  describe('assigns source maps for object expressions and bools', () => {
    const code = `\
      export const fn = () => {
        'use gpu';
        const a = 1;
        const b = true;
        const c = { p: 1, q: 1 };
      };`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { unstable_sourceMaps: true })).toMatchInlineSnapshot(`
        "export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
          'use gpu';

          const a = 1;
          const b = true;
          const c = {
            p: 1,
            q: 1
          };
        }, {
          v: 2,
          name: "fn",
          ast: {
            params: [],
            body: [0, [[13, "a", [5, "1"]], [13, "b", true], [13, "c", [104, {
              p: [5, "1"],
              q: [5, "1"]
            }]]]]
          },
          externals: {},
          sourceMap: {
            path: "TODO",
            entries: [[1, 30], [3, 8], [3, 14], [3, 18], [4, 8], [4, 14], [4, 18], [5, 8], [5, 14], [5, 18], [5, 20], [5, 23], [5, 26], [5, 29]]
          }
        }) && $.f)({});"
      `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { unstable_sourceMaps: true })).toMatchInlineSnapshot(`
        "const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                'use gpu';
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[],"body":[0,[[13,"a",[5,"1"]],[13,"b",true],[13,"c",[104,{"p":[5,"1"],"q":[5,"1"]}]]]]},
            externals: {},
            sourceMap: {"path":"TODO","entries":[[1,30],[3,8],[3,14],[3,18],[4,8],[4,14],[4,18],[5,8],[5,14],[5,18],[5,20],[5,23],[5,26],[5,29]]}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });

  describe('assigns source maps for body-less functions', () => {
    const code = `\
      import { tgpu, d } from 'typegpu';

      export const fn = tgpu.fn([], d.u32)(() => 42)`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { unstable_sourceMaps: true })).toMatchInlineSnapshot(`
        "import { tgpu, d } from 'typegpu';
        export const fn = tgpu.fn([], d.u32)(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => 42, {
          v: 2,
          name: undefined,
          ast: {
            params: [],
            body: [0, [[10, [5, "42"]]]]
          },
          externals: {},
          sourceMap: {
            path: "TODO",
            entries: [[3, 49]]
          }
        }) && $.f)({}));"
      `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { unstable_sourceMaps: true })).toMatchInlineSnapshot(`
        "import { tgpu, d } from 'typegpu';

        const fn = tgpu.fn([], d.u32)((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => 42), {
            v: 2,
            name: undefined,
            ast: {"params":[],"body":[0,[[10,[5,"42"]]]]},
            externals: {},
            sourceMap: {"path":"TODO","entries":[[3,49]]}
          }) && $.f)({})));

        export { fn };
        "
      `);
    });
  });

  describe('multiple plugins', () => {
    const code = `\
      export const fn = () => {
        'use gpu';
        return 1;
      };`;

    // Both plugins inject a `console.log()` in the first line.
    const babelPlugin: BabelTestPlugin = {
      name: 'add-log',
      visitor: {
        Program(path) {
          const logCall = t.expressionStatement(
            t.callExpression(t.memberExpression(t.identifier('console'), t.identifier('log')), []),
          );

          path.unshiftContainer('body', [logCall]);
        },
      },
    };

    const rollupPlugin: Plugin = {
      name: 'unplugin-typegpu',
      transform: {
        handler(this, code: string, id: string) {
          const functionVisitor: TraverseOptions<{ magicString: MagicString }> = {
            Program(_, state) {
              state.magicString.prependLeft(0, 'console.log()\n');
            },
          };

          const ast = parser.parse(
            code,
            getBabelParserOptions(getLang(id), {
              sourceType: 'module',
              allowReturnOutsideFunction: true,
            }),
          );

          const magicString = new MagicString(code);
          const state = { magicString };
          traverse(ast, functionVisitor, undefined, state);

          return {
            code: magicString.toString(),
            map: magicString.generateMap({
              source: id,
              includeContent: true,
              hires: 'boundary',
            }),
          };
        },
      },
    };

    describe('retains original source maps when run second', () => {
      test('[BABEL]', () => {
        expect(babelTransform(code, { unstable_sourceMaps: true }, [babelPlugin]))
          .toMatchInlineSnapshot(`
          "console.log();
          export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
            'use gpu';

            return 1;
          }, {
            v: 2,
            name: "fn",
            ast: {
              params: [],
              body: [0, [[10, [5, "1"]]]]
            },
            externals: {},
            sourceMap: {
              path: "TODO",
              entries: [[1, 30], [3, 8], [3, 15]]
            }
          }) && $.f)({});"
        `);
      });

      test('[ROLLUP]', async () => {
        expect(await rollupTransform(code, { unstable_sourceMaps: true }, [rollupPlugin]))
          .toMatchInlineSnapshot(`
            "console.log();
                  const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                    'use gpu';
                    return 1;
                  }), {
                v: 2,
                name: "fn",
                ast: {"params":[],"body":[0,[[10,[5,"1"]]]]},
                externals: {},
                sourceMap: {"path":"TODO","entries":[[1,30],[3,8],[3,15]]}
              }) && $.f)({}));

            export { fn };
            "
          `);
      });
    });

    describe('retains original source maps when multiple plugins run before', () => {
      test('[BABEL]', () => {
        expect(
          babelTransform(
            code,
            { unstable_sourceMaps: true },
            [babelPlugin, babelPlugin, babelPlugin],
            [babelPlugin],
          ),
        ).toMatchInlineSnapshot(`
          "console.log();
          console.log();
          console.log();
          console.log();
          export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
            'use gpu';

            return 1;
          }, {
            v: 2,
            name: "fn",
            ast: {
              params: [],
              body: [0, [[10, [5, "1"]]]]
            },
            externals: {},
            sourceMap: {
              path: "TODO",
              entries: [[1, 30], [3, 8], [3, 15]]
            }
          }) && $.f)({});"
        `);
      });

      test('[ROLLUP]', async () => {
        expect(
          await rollupTransform(
            code,
            { unstable_sourceMaps: true },
            [rollupPlugin, rollupPlugin, rollupPlugin],
            [rollupPlugin],
          ),
        ).toMatchInlineSnapshot(`
          "console.log();
          console.log();
          console.log();
          console.log();
                const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                  'use gpu';
                  return 1;
                }), {
              v: 2,
              name: "fn",
              ast: {"params":[],"body":[0,[[10,[5,"1"]]]]},
              externals: {},
              sourceMap: {"path":"TODO","entries":[[1,30],[3,8],[3,15]]}
            }) && $.f)({}));

          export { fn };
          "
        `);
      });
    });
  });
});
