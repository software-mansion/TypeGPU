import type { ArrowFunctionExpression } from '@babel/types';
import { transpileBabelFn } from 'tinyest-for-wgsl';
import { describe, expect, it, test, vi } from 'vitest';
import { obfuscate } from '../src/core/obfuscate.ts';
import babelParser from '@babel/parser';
import { stringifyNode } from 'typegpu/~internal';
import { babelTransform, rollupTransform } from './transform.ts';
import { bunPlugin, rollupPlugin } from '../src/index.ts';
import * as common from '../src/core/common.ts';

describe('plugin obfuscation', () => {
  describe('assigns obfuscated metadata', () => {
    const code = `\
      import { tgpu } from 'typegpu';

      const external = { n: 1 }

      export const fn = (argument) => {
        'use gpu';
        const variable = 3;
        return external.n + argument + variable;
      };`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
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
              name: "a"
            }],
            body: [0, [[13, "b", [5, "3"]], [10, [1, [1, "c", "+", "a"], "+", "b"]]]]
          },
          externals: {
            "c": () => external.n
          }
        }) && $.f)({});"
      `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "import 'typegpu';

        const external = { n: 1 };

              const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((argument) => {
                'use gpu';
                const variable = 3;
                return __tsover_add(__tsover_add(external.n, argument), variable);
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[{"type":"i","name":"a"}],"body":[0,[[13,"b",[5,"3"]],[10,[1,[1,"c","+","a"],"+","b"]]]]},
            externals: {"c":() => external.n}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });

  describe('weird identifiers', () => {
    const code = `
      import { tgpu } from 'typegpu';

      export const fn = () => {
        'use gpu';
        const a = undefined;
        const b = Infinity;
        const c = NaN;
      }`;

    test('[BABEL]', () => {
      expect(babelTransform(code, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "import { tgpu } from 'typegpu';
        export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
          'use gpu';

          const a = undefined;
          const b = Infinity;
          const c = NaN;
        }, {
          v: 2,
          name: "fn",
          ast: {
            params: [],
            body: [0, [[13, "a", "b"], [13, "c", "d"], [13, "e", "f"]]]
          },
          externals: {
            "b": () => undefined,
            "d": () => Infinity,
            "f": () => NaN
          }
        }) && $.f)({});"
      `);
    });

    test('[ROLLUP]', async () => {
      expect(await rollupTransform(code, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "import 'typegpu';

        const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
                'use gpu';
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[],"body":[0,[[13,"a","b"],[13,"c","d"],[13,"e","f"]]]},
            externals: {"b":() => undefined,"d":() => Infinity,"f":() => NaN}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });

  describe('obfuscates built shellless functions', () => {
    const code = `\
      const external = { n: 1 }

      export const fn = (argument) => {
        'use gpu';
        const variable = 3;
        return external.n + argument + variable;
      };`;

    test('[BABEL]', () => {
      const built = babelTransform(code, { unstable_obfuscate: false }) as string;
      expect(babelTransform(built, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "const external = {
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
              name: "a"
            }],
            body: [0, [[13, "b", [5, "3"]], [10, [1, [1, "c", "+", "a"], "+", "b"]]]]
          },
          externals: {
            "c": () => external.n
          }
        }) && $.f)({});"
      `);
    });

    test('[ROLLUP]', async () => {
      const built = await rollupTransform(code, { unstable_obfuscate: false });
      expect(await rollupTransform(built, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "const external = { n: 1 };

              const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((argument) => {
                'use gpu';
                const variable = 3;
                return __tsover_add(__tsover_add(external.n, argument), variable);
              }), {
            v: 2,
            name: "fn",
            ast: {"params":[{"type":"i","name":"a"}],"body":[0,[[13,"b",[5,"3"]],[10,[1,[1,"c","+","a"],"+","b"]]]]},
            externals: {"c":() => external.n}
          }) && $.f)({}));

        export { fn };
        "
      `);
    });
  });

  describe('obfuscates built shelled functions', () => {
    const code = `\
      import { tgpu, d } from 'typegpu';

      const external = { n: 1 }

      export const fn = tgpu.fn([d.f32], d.f32)((argument) => {
        const variable = 3;
        return external.n + argument + variable;
      });`;

    test('[BABEL]', () => {
      const built = babelTransform(code, { unstable_obfuscate: false }) as string;
      expect(babelTransform(built, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "import { tgpu, d } from 'typegpu';
        const external = {
          n: 1
        };
        export const fn = tgpu.fn([d.f32], d.f32)(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = argument => {
          const variable = 3;
          return external.n + argument + variable;
        }, {
          v: 2,
          name: undefined,
          ast: {
            params: [{
              type: "i",
              name: "a"
            }],
            body: [0, [[13, "b", [5, "3"]], [10, [1, [1, "c", "+", "a"], "+", "b"]]]]
          },
          externals: {
            "c": () => external.n
          }
        }) && $.f)({}));"
      `);
    });

    test('[ROLLUP]', async () => {
      const built = await rollupTransform(code, { unstable_obfuscate: false });
      expect(await rollupTransform(built, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
        "import { tgpu, d } from 'typegpu';

        const external = { n: 1 };

              const fn = tgpu.fn([d.f32], d.f32)((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((argument) => {
                const variable = 3;
                return external.n + argument + variable;
              }), {
            v: 2,
            name: undefined,
            ast: {"params":[{"type":"i","name":"a"}],"body":[0,[[13,"b",[5,"3"]],[10,[1,[1,"c","+","a"],"+","b"]]]]},
            externals: {"c":() => external.n}
          }) && $.f)({})));

        export { fn };
        "
      `);
    });
  });

  describe('is idempotent', () => {
    const code = `\
      const external = { n: 1 }

      export const fn = (argument) => {
        'use gpu';
        const variable = 3;
        return external.n + argument + variable;
      };`;

    test('[BABEL]', () => {
      const once = babelTransform(code, { unstable_obfuscate: true }) as string;
      const twice = babelTransform(once, { unstable_obfuscate: true });
      expect(twice).toBe(once);
    });

    test('[ROLLUP]', async () => {
      const once = await rollupTransform(code, { unstable_obfuscate: true });
      const twice = await rollupTransform(once, { unstable_obfuscate: true });
      expect(twice).toBe(once);
    });
  });

  describe('warns once per file about unsupported metadata versions', () => {
    const code = `\
      export const a = () => {
        'use gpu';
      };
      export const b = () => {
        'use gpu';
      };`;

    test('[BABEL]', () => {
      using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const built = babelTransform(code, { unstable_obfuscate: false }) as string;
      const unsupported = built.replace(/\bv: \d+/g, 'v: 1');
      const result = babelTransform(unsupported, { unstable_obfuscate: true });

      expect(result).toBe(babelTransform(unsupported, { unstable_obfuscate: false }));
      expect(warn.mock.calls).toHaveLength(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(
        /Cannot obfuscate already transformed functions.*unsupported metadata version 1 \(expected 2\)/,
      );
    });

    test('[ROLLUP]', async () => {
      using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const built = await rollupTransform(code, { unstable_obfuscate: false });
      const unsupported = built.replace(/\bv: \d+/g, 'v: 1');
      const result = await rollupTransform(unsupported, { unstable_obfuscate: true });

      expect(result).toBe(await rollupTransform(unsupported, { unstable_obfuscate: false }));
      expect(warn.mock.calls).toHaveLength(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(
        /Cannot obfuscate already transformed functions.*unsupported metadata version 1 \(expected 2\)/,
      );
    });
  });

  describe('does not prune files that only contain embedded metadata when obfuscation is on', () => {
    const code = `\
      const external = { n: 1 };
      export const fn = () => {
        'use gpu';
        return external.n;
      };`;

    test('[BABEL]', () => {
      const built = babelTransform(code, { unstable_obfuscate: false }) as string;
      const withoutDirective = built.replace(/^[ \t]*['"]use gpu['"];?\r?\n/gm, '');
      expect(withoutDirective).not.toMatch(/use gpu|t(ype)?gpu/);

      expect(babelTransform(withoutDirective, { unstable_obfuscate: true })).toMatchInlineSnapshot(`
          "const external = {
            n: 1
          };
          export const fn = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
            return external.n;
          }, {
            v: 2,
            name: "fn",
            ast: {
              params: [],
              body: [0, [[10, "a"]]]
            },
            externals: {
              "a": () => external.n
            }
          }) && $.f)({});"
        `);
    });

    test('[ROLLUP]', async () => {
      const built = await rollupTransform(code, { unstable_obfuscate: false });
      const withoutDirective = built.replace(/^[ \t]*['"]use gpu['"];?\r?\n/gm, '');
      expect(withoutDirective).not.toMatch(/use gpu|t(ype)?gpu/);

      expect(await rollupTransform(withoutDirective, { unstable_obfuscate: true }))
        .toMatchInlineSnapshot(`
      "const external = { n: 1 };
            const fn = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
              return external.n;
            }), {
          v: 2,
          name: "fn",
          ast: {"params":[],"body":[0,[[10,"a"]]]},
          externals: {"a":() => external.n}
        }) && $.f)({}));

      export { fn };
      "
      `);
    });
  });

  describe('prunes files that only contain embedded metadata when obfuscation is off', () => {
    const code = `\
      export const fn = () => {
        'use gpu';
        return 42;
      };`;

    test('[BABEL]', () => {
      const built = babelTransform(code, { unstable_obfuscate: false }) as string;
      const withoutDirective = built.replace(/^[ \t]*['"]use gpu['"];?\r?\n/gm, '');
      expect(withoutDirective).not.toMatch(/use gpu|t(ype)?gpu/);

      using visitor = vi.spyOn(common, 'functionVisitor', 'get');
      babelTransform(withoutDirective, { unstable_obfuscate: false });
      expect(visitor).not.toHaveBeenCalled();
    });

    test('[ROLLUP]', async () => {
      const built = await rollupTransform(code, { unstable_obfuscate: false });
      const withoutDirective = built.replace(/^[ \t]*['"]use gpu['"];?\r?\n/gm, '');
      expect(withoutDirective).not.toMatch(/use gpu|t(ype)?gpu/);

      using visitor = vi.spyOn(common, 'functionVisitor', 'get');
      await rollupTransform(withoutDirective, { unstable_obfuscate: false });
      expect(visitor).not.toHaveBeenCalled();
    });
  });

  describe('conflicting options', () => {
    test('[BABEL]', () => {
      expect(() =>
        babelTransform('', { unstable_obfuscate: true, autoNamingEnabled: true }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: unknown file: Options 'unstable_obfuscate' and 'autoNamingEnabled' cannot be enabled at the same time.]`,
      );
    });

    test('[ROLLUP]', async () => {
      expect(() =>
        rollupPlugin({
          ...common.defaultOptions,
          unstable_obfuscate: true,
          autoNamingEnabled: true,
        }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Options 'unstable_obfuscate' and 'autoNamingEnabled' cannot be enabled at the same time.]`,
      );
    });

    test('[BUN]', async () => {
      expect(() =>
        bunPlugin({ autoNamingEnabled: true, unstable_obfuscate: true }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Options 'unstable_obfuscate' and 'autoNamingEnabled' cannot be enabled at the same time.]`,
      );
    });
  });
});

// Here, we only test tinyest -> tinyest transformation.
// We could write tinyest by hand, but this is more readable.
function parse(code: string): ArrowFunctionExpression {
  const parsed = babelParser.parse(code, { sourceType: 'module', plugins: ['typescript'] });
  const maybeExpressionStatement = parsed.program.body[0];
  if (maybeExpressionStatement?.type !== 'ExpressionStatement') {
    throw new Error(
      `Invalid parse usage. Expected an expression statement (got ${maybeExpressionStatement?.type}).`,
    );
  }
  const maybeFunction = maybeExpressionStatement.expression;
  if (maybeFunction?.type !== 'ArrowFunctionExpression') {
    throw new Error(
      `Invalid parse usage. Expected an arrow function expression (got ${maybeFunction?.type}).`,
    );
  }
  return maybeFunction;
}

describe('obfuscate', () => {
  it('obfuscates used variables', () => {
    const code = `() => { const variable = 1; const other = 2; const sensitiveName = 3; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = 1;
        const b = 2;
        const c = 3;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('keeps the source map', () => {
    const code = `() => { const variable = 1; return variable; }`;
    const transpiled = transpileBabelFn(parse(code));

    expect(obfuscate(transpiled).sourceMap).toBe(transpiled.sourceMap);
  });

  it('remembers obfuscated names', () => {
    const code = `() => { const variable = 1; return variable; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = 1;
        return a;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('remembers obfuscated names in computed access', () => {
    const code = `() => { const variable = 1; const array = [1, 2]; return array[variable]; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = 1;
        const b = [1, 2];
        return b[a];
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('remembers obfuscated names in for loops', () => {
    const code = `() => { for (let i = 0; i< 10; i++) { return i; } }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        for (let a = 0; a < 10; a++) {
          return a;
        }
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('handles weird identifiers', () => {
    const code = `() => {
      const a = undefined;
      const b = Infinity;
      const c = NaN;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toStrictEqual([]);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = b;
        const c = d;
        const e = f;
      }"
    `);
    // These are identifiers, so they should be in externals.
    expect(externalNames).toMatchInlineSnapshot(`
      Map {
        "b" => "undefined",
        "d" => "Infinity",
        "f" => "NaN",
      }
    `);
  });

  it('handles null', () => {
    const code = `() => {
      const variable = null;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toStrictEqual([]);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = null;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('obfuscates parameters', () => {
    const code = `(param1, param2) => { return param2 + param1; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

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
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        return b + a;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('obfuscates destructured parameters', () => {
    const code = `(param, { prop }) => { return param + prop; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

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
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        return a + b;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('obfuscates destructured parameters with aliases', () => {
    const code = `(param, { prop, other: alias }) => { return param + prop + alias; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

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
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        return (a + b) + c;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('does not obfuscate struct props', () => {
    const code = `(param) => { let struct; return param.prop + struct.field; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`
      [
        {
          "name": "a",
          "type": "i",
        },
      ]
    `);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        let b;
        return a.prop + b.field;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('does not obfuscate non-computed struct keys', () => {
    const code = `(param) => { let struct = { field: 1 }; return struct.field; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`
      [
        {
          "name": "a",
          "type": "i",
        },
      ]
    `);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        let b = { field: 1 };
        return b.field;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('obfuscates computed struct keys', () => {
    const code = `() => { const prop = 'field'; const struct = { [prop]: 1, [getProp()]: 2, ['prop']: 3 }; return struct[prop] + struct[getProp()] + struct['prop']; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { body, externalNames } = obfuscate(transpiled);

    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = "field";
        const b = { [a]: 1, [c()]: 2, ["prop"]: 3 };
        return (b[a] + b[c()]) + b["prop"];
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`
      Map {
        "c" => "getProp",
      }
    `);
  });

  it("obfuscates 'this'", () => {
    const code = `() => { return this.prop1.prop2; }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        return a;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`
      Map {
        "a" => "this.prop1.prop2",
      }
    `);
  });

  it('obfuscates externals', () => {
    const code = `() => {
      const var1 = ext.value;
      const var2 = ext.config.multiplier;
      const var3 = ext.config.zero;
      const var4 = ext.config.multiplier;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = b;
        const c = d;
        const e = f;
        const g = d;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`
      Map {
        "b" => "ext.value",
        "d" => "ext.config.multiplier",
        "f" => "ext.config.zero",
      }
    `);
  });

  it('obfuscates complex externals', () => {
    const code = `() => {
      const h = ext.t.fn().prop;
      const i = ext.t.comp['computed'].prop;
      const j = ext.t.$.prop;
      const k = (ext).prop;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = b().prop;
        const c = d["computed"].prop;
        const e = f.$.prop;
        const g = h;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`
      Map {
        "b" => "ext.t.fn",
        "d" => "ext.t.comp",
        "f" => "ext.t",
        "h" => "ext.prop",
      }
    `);
  });

  it('correctly handles variable shadowing', () => {
    const code = `() => {
      const variable = 1;
      {
        const variable = 2;
        if (false) {
          return variable;
        }
      }
      return variable;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = 1;
      {
          const a = 2;
          if (false) {
            return a;
          }
        }
        return a;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('correctly handles parameter shadowing', () => {
    const code = `(parameter) => {
      {
        const parameter = 2;
        if (false) {
          return parameter;
        }
      }
      return parameter;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`
      [
        {
          "name": "a",
          "type": "i",
        },
      ]
    `);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
      {
          const a = 2;
          if (false) {
            return a;
          }
        }
        return a;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('correctly handles external shadowing', () => {
    const code = `() => {
      const variable = external;
      {
        const external = 1;
        return external;
      }
      return external;
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const a = b;
      {
          const b = 1;
          return b;
        }
        return b;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`
      Map {
        "b" => "external",
      }
    `);
  });

  it('supports more than 26 names', () => {
    const code = `() => { ${Array.from({ length: 100 }, (_, i) => `let v${i};`).join('\n')} }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    const stringifiedBody = stringifyNode(body);
    expect(stringifiedBody).toContain('z');
    expect(stringifiedBody).toContain('aa');
    expect(stringifiedBody).toContain('ab');
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('correctly handles switch cases', () => {
    const code = `(param) => { 
      const myVar = 1;
      switch (myVar) {
        case 1:
          return param;
        case "error":
        default:
          return 3;
        case 2: {
          const myVar = 2;
          return myVar + param;
        }
      }
    }`;
    const transpiled = transpileBabelFn(parse(code));

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`
      [
        {
          "name": "a",
          "type": "i",
        },
      ]
    `);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        const b = 1;
        switch (b) {
          case 1:
            return a;
          case "error":
          default:
            return 3;
          case 2:
      {
              const b = 2;
              return b + a;
            }
        }
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('supports boolean nodes', () => {
    const code = `() => { return true || false; }`;
    const transpiled = transpileBabelFn(parse(code), { verboseNodes: true });

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`[]`);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        return true || false;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });

  it('supports identifier nodes', () => {
    const code = `(param) => { return param; }`;
    const transpiled = transpileBabelFn(parse(code), { verboseNodes: true });

    const { params, body, externalNames } = obfuscate(transpiled);

    expect(params).toMatchInlineSnapshot(`
      [
        {
          "name": "a",
          "type": "i",
        },
      ]
    `);
    expect(stringifyNode(body)).toMatchInlineSnapshot(`
      "{
        return a;
      }"
    `);
    expect(externalNames).toMatchInlineSnapshot(`Map {}`);
  });
});
