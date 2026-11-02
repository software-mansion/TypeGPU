import Babel from '@babel/standalone';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { expect, it } from 'vitest';

// React Native's Metro transpiles ESM to CommonJS with Babel, which used to turn
// `export * as '~unstable' from '...'` into invalid code: `exports.~unstable = ...`
it('tgpu.ts transpiles to valid CommonJS with Babel', () => {
  const source = readFileSync(new URL('../../src/tgpu.ts', import.meta.url), 'utf8');
  const { code } = Babel.transform(source, {
    plugins: ['transform-export-namespace-from', 'transform-modules-commonjs'],
  });

  expect(() => compileFunction(code ?? '')).not.toThrow();
});
