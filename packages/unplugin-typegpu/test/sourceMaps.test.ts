import { describe, expect, test, vi } from 'vitest';
import {
  type BabelTestPlugin,
  babelTransform,
  rollupTransform,
  webpackTransform,
} from './transform.ts';
import * as t from '@babel/types';
import type { Plugin } from 'rollup';
import * as parser from '@babel/parser';
import traverse, { type TraverseOptions } from '@babel/traverse';
import MagicString from 'magic-string';
import { getBabelParserOptions, getLang } from 'ast-kit';
import { createUnplugin, type UnpluginFactory } from 'unplugin';

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

const unpluginFactory = (() => {
  return {
    name: 'add-log',
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
}) satisfies UnpluginFactory<undefined, false>;
const unpluginPlugin = createUnplugin(unpluginFactory);
const rollupPlugin = unpluginPlugin.rollup() as Plugin;
const webpackPlugin = unpluginPlugin.webpack();

// The result includes many irrelevant comments,
// including the path that is different with each test execution.
function stripWebpackResult(res: string) {
  return res.split('/* harmony export */ });\n').at(-1)?.split('/******/ })()').at(0);
}

function stripAstBody(res: string | null | undefined) {
  if (!res) {
    return res;
  }
  return res
    .split(/body: |"body":/)
    .at(-1)
    ?.split('},\n')
    .at(0);
}

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
      const transformed = babelTransform(code, { unstable_sourceMaps: true });

      expect(transformed).toMatchInlineSnapshot(
        `
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
            body: [-1, 5, 38, [0, [[-1, 7, 8, [13, [-1, 7, 14, [9, "variable"]], [-1, 7, 25, [5, "3"]]]], [-1, 8, 8, [10, [-1, 8, 15, [1, [-1, 8, 15, [1, [-1, 8, 15, [9, "external.n"]], "+", [-1, 8, 28, [9, "argument"]]]], "+", [-1, 8, 39, [9, "variable"]]]]]]]]]
          },
          externals: {
            "external.n": () => external.n
          }
        }) && $.f)({});"
      `,
      );
    });

    test('[ROLLUP]', async () => {
      const transformed = await rollupTransform(code, { unstable_sourceMaps: true });

      expect(transformed).toMatchInlineSnapshot(
        `
        "import 'typegpu';

        const external = { n: 1 };

              const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((argument) => {
                'use gpu';
                const variable = 3;
                return __tsover_add(__tsover_add(external.n, argument), variable);
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[{"type":"i","name":"argument"}],"body":[-1,5,38,[0,[[-1,7,8,[13,[-1,7,14,[9,"variable"]],[-1,7,25,[5,"3"]]]],[-1,8,8,[10,[-1,8,15,[1,[-1,8,15,[1,[-1,8,15,[9,"external.n"]],"+",[-1,8,28,[9,"argument"]]]],"+",[-1,8,39,[9,"variable"]]]]]]]]]},
            externals: {"external.n":() => external.n}
          }) && $.f)({}));

        export { fn };
        "
      `,
      );
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
      const transformed = babelTransform(code, { unstable_sourceMaps: true });
      const stripped = stripAstBody(transformed);

      expect(stripped).toMatchInlineSnapshot(`
        "[-1, 1, 30, [0, [[-1, 3, 8, [13, [-1, 3, 14, [9, "a"]], [-1, 3, 18, [5, "1"]]]], [-1, 4, 8, [13, [-1, 4, 14, [9, "b"]], [-1, 4, 18, [107, true]]]], [-1, 5, 8, [13, [-1, 5, 14, [9, "c"]], [-1, 5, 18, [104, {
              p: [-1, 5, 23, [5, "1"]],
              q: [-1, 5, 29, [5, "1"]]
            }]]]]]]]
          "
      `);
    });

    test('[ROLLUP]', async () => {
      const transformed = await rollupTransform(code, { unstable_sourceMaps: true });
      const stripped = stripAstBody(transformed);

      expect(stripped).toMatchInlineSnapshot(
        `"[-1,1,30,[0,[[-1,3,8,[13,[-1,3,14,[9,"a"]],[-1,3,18,[5,"1"]]]],[-1,4,8,[13,[-1,4,14,[9,"b"]],[-1,4,18,[107,true]]]],[-1,5,8,[13,[-1,5,14,[9,"c"]],[-1,5,18,[104,{"p":[-1,5,23,[5,"1"]],"q":[-1,5,29,[5,"1"]]}]]]]]]]"`,
      );
    });
  });

  describe('assigns source maps for body-less functions', () => {
    const code = `\
      import { tgpu, d } from 'typegpu';

      export const fn = tgpu.fn([], d.u32)(() => 42)`;

    test('[BABEL]', () => {
      const transformed = babelTransform(code, { unstable_sourceMaps: true });
      const stripped = stripAstBody(transformed);

      expect(stripped).toMatchInlineSnapshot(`
        "[0, [[10, [-1, 3, 49, [5, "42"]]]]]
          "
      `);
    });

    test('[ROLLUP]', async () => {
      const transformed = await rollupTransform(code, { unstable_sourceMaps: true });
      const stripped = stripAstBody(transformed);

      expect(stripped).toMatchInlineSnapshot(`"[0,[[10,[-1,3,49,[5,"42"]]]]]"`);
    });
  });

  describe('multiple plugins', () => {
    const code = `\
      export const fn = () => {
        'use gpu';
        return 1;
      };`;

    describe('retains original source maps when run second', () => {
      test('[BABEL]', () => {
        const transformed = babelTransform(code, { unstable_sourceMaps: true }, [babelPlugin]);
        const stripped = stripAstBody(transformed);

        expect(stripped).toMatchInlineSnapshot(`
          "[-1, 1, 30, [0, [[-1, 3, 8, [10, [-1, 3, 15, [5, "1"]]]]]]]
            "
        `);
      });

      test('[ROLLUP]', async () => {
        const transformed = await rollupTransform(code, { unstable_sourceMaps: true }, [
          rollupPlugin,
        ]);
        const stripped = stripAstBody(transformed);

        expect(stripped).toMatchInlineSnapshot(`"[-1,1,30,[0,[[-1,3,8,[10,[-1,3,15,[5,"1"]]]]]]]"`);
      });
    });

    test('[WEBPACK] works when plugin does not expose `getCombinedSourcemap`', async () => {
      const transformed = await webpackTransform(code, { unstable_sourceMaps: true });
      const stripped = stripAstBody(stripWebpackResult(transformed));

      expect(stripped).toMatchInlineSnapshot(`"[-1,1,30,[0,[[-1,3,8,[10,[-1,3,15,[5,"1"]]]]]]]"`);
    });

    test('[WEBPACK] warns and falls back to node position when run second and plugin does not expose `getCombinedSourcemap`', async () => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const transformed = await webpackTransform(code, { unstable_sourceMaps: true }, [
        webpackPlugin,
      ]);
      const stripped = stripAstBody(stripWebpackResult(transformed));

      expect(stripped).toMatchInlineSnapshot(`"[-1,2,30,[0,[[-1,4,8,[10,[-1,4,15,[5,"1"]]]]]]]"`);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
        [
          "This version of unplugin-typegpu does not support combined source maps.
        If another plugin modifies the code, source maps may point to modified locations.",
        ]
      `);
    });

    describe('retains original source maps when multiple plugins run before', () => {
      test('[BABEL]', () => {
        const transformed = babelTransform(
          code,
          { unstable_sourceMaps: true },
          [babelPlugin, babelPlugin, babelPlugin],
          [babelPlugin],
        );
        const stripped = stripAstBody(transformed);

        expect(stripped).toMatchInlineSnapshot(`
          "[-1, 1, 30, [0, [[-1, 3, 8, [10, [-1, 3, 15, [5, "1"]]]]]]]
            "
        `);
      });

      test('[ROLLUP]', async () => {
        const transformed = await rollupTransform(
          code,
          { unstable_sourceMaps: true },
          [rollupPlugin, rollupPlugin, rollupPlugin],
          [rollupPlugin],
        );
        const stripped = stripAstBody(transformed);

        expect(stripped).toMatchInlineSnapshot(`"[-1,1,30,[0,[[-1,3,8,[10,[-1,3,15,[5,"1"]]]]]]]"`);
      });
    });
  });
});
