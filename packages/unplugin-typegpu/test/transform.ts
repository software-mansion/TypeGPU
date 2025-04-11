import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { rollup } from 'rollup';
import type { TypegpuPluginOptions } from '../src';
import babelPlugin from '../src/babel';
import rollupPlugin from '../src/rollup';

const defaultPluginOptions: TypegpuPluginOptions = { include: 'all' };

export const babelTransform = (
  code: string,
  options: TypegpuPluginOptions = defaultPluginOptions,
) => Babel.transform(code, { plugins: [[babelPlugin, options]] }).code;

export const rollupTransform = (
  code: string,
  options: TypegpuPluginOptions = defaultPluginOptions,
) =>
  rollup({
    input: 'code',
    plugins: [virtual({ code }), rollupPlugin(options)],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);
