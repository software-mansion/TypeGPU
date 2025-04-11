import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { rollup } from 'rollup';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/common.ts';
import rollupPlugin from '../src/rollup.ts';

const pluginOptions: Options = {
  include: [/\.m?[jt]sx?$/, /virtual:/],
};

export const babelTransform = (code: string) =>
  Babel.transform(code, { plugins: [[babelPlugin, pluginOptions]] }).code;

export const rollupTransform = (code: string) =>
  rollup({
    input: 'code',
    plugins: [virtual({ code }), rollupPlugin(pluginOptions)],
    external: ['typegpu', /^typegpu\/.*$/],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);
