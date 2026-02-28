import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { rollup } from 'rollup';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/common.ts';
import rollupPlugin from '../src/rollup.ts';

const defaultOptions: Options = {
  include: [/\.m?[jt]sx?$/, /virtual:/],
  autoNamingEnabled: false,
};

export const babelTransform = (code: string, options?: Options) =>
  Babel.transform(code, {
    plugins: [[babelPlugin, { ...defaultOptions, ...options }]],
    parserOpts: { plugins: ['typescript'] },
  }).code;

export const rollupTransform = (code: string, options?: Options) =>
  rollup({
    input: 'code',
    plugins: [virtual({ code }), rollupPlugin({ ...defaultOptions, ...options })],
    external: ['typegpu', /^typegpu\/.*$/],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);
