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
  });

  describe('ROLLUP', () => {
    it('allows multiple usages of one external', async () => {
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

      expect(extractExternals(await rollupTransform(code))).toMatchInlineSnapshot(
        `"() => ({ext}),"`,
      );
    });
  });
});
