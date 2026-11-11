import Babel from '@babel/standalone';
import { rollup } from 'rollup';
import { describe, expect, it } from 'vitest';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/core/common.ts';
import rollupPlugin from '../src/rollup.ts';

const code = `\
  import tgpu from 'typegpu';
  const myFn = tgpu.fn([])(() => {
    'use gpu';
    return 1;
  });
`;

const babelTransform = (filename: string, options?: Options) =>
  Babel.transform(code, {
    filename,
    plugins: [[babelPlugin, options ?? {}]],
    parserOpts: { plugins: ['typescript'] },
  }).code;

const rollupTransform = (id: string, options?: Options) =>
  rollup({
    input: id,
    plugins: [
      {
        name: 'fs-stub',
        resolveId: (source) => (source === id ? id : null),
        load: (source) => (source === id ? code : null),
      },
      rollupPlugin(options),
    ],
    external: ['typegpu'],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);

const cases = [
  ['/project/src/index.ts', undefined, true],
  ['/project/node_modules/lib/index.ts', undefined, false],
  ['/project/node_modules/lib/index.ts', { exclude: [] }, true],
] as const;

describe('[BABEL] node_modules exclusion', () => {
  it.each(cases)('%s with %o', (filename, options, shouldTransform) => {
    const result = babelTransform(filename, options as Options | undefined);
    expect(result?.includes('__TYPEGPU_META__')).toBe(shouldTransform);
  });
});

describe('[ROLLUP] node_modules exclusion', () => {
  it.each(cases)('%s with %o', async (id, options, shouldTransform) => {
    const result = await rollupTransform(id, options as Options | undefined);
    expect(result.includes('__TYPEGPU_META__')).toBe(shouldTransform);
  });
});
