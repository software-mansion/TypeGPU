import { describe, expect, it } from 'vitest';
import * as parser from '@babel/parser';
import _traverse from '@babel/traverse';
import * as t from '@babel/types';
import { babelTransform, rollupTransform } from './transform.ts';

let traverse = _traverse;
if (typeof (traverse as unknown as { default: typeof traverse }).default === 'function') {
  traverse = (traverse as unknown as { default: typeof traverse }).default;
}

/**
 * Returns the externals argument of the first metadata helper call
 */
function extractExternals(code: string | undefined | null) {
  if (!code) {
    throw new Error('Expected code to be truthy.');
  }
  let externals: string | undefined;
  traverse(parser.parse(code, { sourceType: 'module' }), {
    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (externals === undefined && t.isIdentifier(callee, { name: '__tgpu_meta' }) && args[2]) {
        externals = code.slice(args[2].start ?? 0, args[2].end ?? 0);
      }
    },
  });
  if (externals === undefined) {
    throw new Error("Expected 'externals' to be present in code.");
  }
  return externals;
}

describe('externals gathering', () => {
  describe('multiple usages of one external', () => {
    const code = `\
    const ext = {
      value: 7,
      config: {
        multiplier: 1,
        zero: 0,
      }
    };
    const fn = () => {
      'use gpu';
      const a = ext.value;
      const b = ext.config.multiplier;
      const c = ext.config.zero;
      const d = ext.config.multiplier;
    };
    console.log(fn);`;

    it('works for BABEL', () => {
      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "{
          "ext.value": () => ext.value,
          "ext.config.multiplier": () => ext.config.multiplier,
          "ext.config.zero": () => ext.config.zero
        }"
      `);
    });

    it('works for ROLLUP', async () => {
      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(
        `"{"ext.value":() => ext.value,"ext.config.multiplier":() => ext.config.multiplier,"ext.config.zero":() => ext.config.zero}"`,
      );
    });
  });

  describe('dereference', () => {
    const code = `\
    import tgpu, { d } from 'typegpu';

    const root = await tgpu.init();
    const buffer = root.createMutable(d.vec2u);
    const fn = () => {
      'use gpu';
      const a = buffer.$.x;
    };
    console.log(fn);`;

    it('works for BABEL', () => {
      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "{
          "buffer": () => buffer
        }"
      `);
    });

    it('works for ROLLUP', async () => {
      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(
        `"{"buffer":() => buffer}"`,
      );
    });
  });

  describe('computed prop access', () => {
    const code = `\
    const ext = {
      n: 1,
    };

    const fn = () => {
      'use gpu';
      const a = ext['n'];
    };
    console.log(fn);`;

    it('works for BABEL', () => {
      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "{
          "ext": () => ext
        }"
      `);
    });

    it('works for ROLLUP', async () => {
      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(
        `"{"ext":() => ext}"`,
      );
    });
  });

  describe('calls', () => {
    const code = `\
    import tgpu, { d } from 'typegpu';

    const fn = () => {
      'use gpu';
      const a = ext.comptime().x;
      const b = ext.runtime().y;
    };

    const ext = {
      comptime: tgpu.comptime(() => {
        return d.vec4f();
      }),
      runtime: () => {
        'use gpu';
        return d.vec4f();
      },
    };

    console.log(fn);`;

    it('works for BABEL', () => {
      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "{
          "ext.comptime": () => ext.comptime,
          "ext.runtime": () => ext.runtime
        }"
      `);
    });

    it('works for ROLLUP', async () => {
      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(
        `"{"ext.comptime":() => ext.comptime,"ext.runtime":() => ext.runtime}"`,
      );
    });
  });

  describe('private prop access', () => {
    const code = `\
    import tgpu, { d } from 'typegpu';

    const cls = new (class {
      #const = tgpu.const(d.u32, 1);

      fn = () => {
        'use gpu';
        const a = this.#const.$;
      };
    })();

    console.log(cls);`;

    it('works for BABEL', () => {
      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "{
            "this.#const": () => this.#const
          }"
      `);
    });

    it('works for ROLLUP', async () => {
      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(
        `"{"this.#const":() => this.#const}"`,
      );
    });
  });
});
