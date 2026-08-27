import { describe, expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

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
            entries: []
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
            sourceMap: {"path":"TODO","entries":[]}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });
});
