import { expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

it.each([
  ['Babel', babelTransform],
  ['Rollup', rollupTransform],
] as const)(
  'B67: %s preserves reassignment of a JavaScript function declaration',
  async (_, transform) => {
    // This is legal JavaScript input; TypeScript itself rejects reassigning declarations.
    const source = `
    function outer() {
      function shader() { 'use gpu'; return 1; }
      shader = () => 2;
      return shader();
    }
    record(outer());
  `;
    const run = (code: string) => {
      const values: number[] = [];
      // oxlint-disable-next-line typescript/no-implied-eval -- Executes transformed JavaScript to verify the plugin preserves runtime behavior.
      new Function('record', code)((value: number) => values.push(value));
      return values;
    };

    expect(run(source)).toEqual([2]);
    const transformed = await transform(source);
    expect(typeof transformed).toBe('string');
    expect(run(transformed ?? '')).toEqual([2]);
  },
);
