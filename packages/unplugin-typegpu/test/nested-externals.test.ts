import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

function extractExternals(code: string | undefined | null) {
  if (!code) {
    throw new Error('Expected code to be truthy.');
  }
  const startIndex = code.indexOf('externals:') + 'externals:'.length;
  const endIndex = code.indexOf('}) && $.f');
  return code.slice(startIndex, endIndex).trim();
}

describe('externals gathering', () => {
  describe('BABEL', () => {
    it('allows multiple usages of one external', () => {
      const code = `\
        const ext = {
          value: 7,
          config: {
            multiplier: 1,
            zero: 0,
          }
        };
        const foo = () => {
          'use gpu';
          const a = ext.value;
          const b = ext.config.multiplier;
          const c = ext.config.zero;
          const d = ext.config.multiplier;
        };
        console.log(foo);`;

      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "() => {
            return {
              ext
            };
          }"
      `);
    });

    it('treats dereference like a regular external', () => {
      const code = `\
        import tgpu, { d } from 'typegpu';

        const root = await tgpu.init();
        const buffer = root.createMutable(d.vec2u);
        const foo = () => {
          'use gpu';
          const a = buffer.$.x;
        };
        console.log(foo);`;

      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "() => {
            return {
              buffer
            };
          }"
      `);
    });

    it('skips computed prop access', () => {
      const code = `\
        const ext = {
          n: 1,
        };

        const fn = () => {
          'use gpu';
          const a = ext['n'];
        };
        console.log(fn);`;

      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "() => {
            return {
              ext
            };
          }"
      `);
    });

    it('skips calls', () => {
      const code = `\
        import tgpu, { d } from 'typegpu';

        const ext = {
          comptime: tgpu.comptime(() => {
            return d.vec4f();
          }),
          runtime: () => {
            'use gpu';
            return d.vec4f();
          },
        };

        const fn = () => {
          'use gpu';
          const a = ext.comptime().x;
          const b = ext.runtime().y;
        };`;

      expect(extractExternals(babelTransform(code))).toMatchInlineSnapshot(`
        "() => {
              return {
                d
              };
            }"
      `);
    });
  });

  describe('ROLLUP', () => {
    it('allows multiple usages of one external', async () => {
      const code = ``;

      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(`""`);
    });
  });
});
