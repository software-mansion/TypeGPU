import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { type Plugin, rollup } from 'rollup';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/core/common.ts';
import rollupPlugin from '../src/rollup.ts';

const defaultOptions: Options = {
  include: [/\.m?[jt]sx?$/, /virtual:/],
  autoNamingEnabled: false,
};

type BabelTransformOptions = Parameters<typeof Babel.transform>[1];
export type BabelTestPlugin = NonNullable<BabelTransformOptions['plugins']>[number];

export const babelTransform = (
  code: string,
  options?: Options,
  additionalPlugins: BabelTestPlugin[] = [],
) =>
  Babel.transform(code, {
    plugins: [[babelPlugin, { ...defaultOptions, ...options }], ...additionalPlugins],
    parserOpts: { plugins: ['typescript'] },
  }).code;

export const rollupTransform = (
  code: string,
  options?: Options,
  additionalPlugins: Plugin[] = [],
) =>
  rollup({
    input: 'code',
    plugins: [
      virtual({ code }),
      rollupPlugin({ ...defaultOptions, ...options }),
      ...additionalPlugins,
    ],
    external: ['typegpu', /^typegpu\/.*$/],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);
