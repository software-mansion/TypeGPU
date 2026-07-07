import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

function extractExternals(code: string | undefined | null) {
  if (!code) {
    throw new Error('Expected code to be truthy.');
  }
  if (!code.includes('externals:')) {
    throw new Error("Expected 'externals' to be present in code.");
  }
  const startIndex = code.indexOf('externals:') + 'externals:'.length;
  const endIndex = code.indexOf('}) && $.f');
  return code.slice(startIndex, endIndex).trim();
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
        `"{ "ext.value": () => ext.value, "ext.config.multiplier": () => ext.config.multiplier, "ext.config.zero": () => ext.config.zero }"`,
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
        `"{ "buffer": () => buffer }"`,
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
        `"{ "ext": () => ext }"`,
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
        `"{ "ext.comptime": () => ext.comptime, "ext.runtime": () => ext.runtime }"`,
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
      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "{
              "this.#const": () => this.#const
            }"
      `);
    });
  });
});
