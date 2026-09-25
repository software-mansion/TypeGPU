import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Plugin, rollup } from 'rollup';
import { type Configuration, webpack } from 'webpack';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/core/common.ts';
import rollupPlugin from '../src/rollup.ts';
import webpackPlugin from '../src/webpack.ts';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const defaultOptions: Options = {
  include: [/\.m?[jt]sx?$/, /virtual:/],
  autoNamingEnabled: false,
};

type BabelTransformOptions = Parameters<typeof Babel.transform>[1];
export type BabelTestPlugin = NonNullable<BabelTransformOptions['plugins']>[number];

export const babelTransform = (
  code: string,
  options?: Options,
  prePlugins: BabelTestPlugin[] = [],
  postPlugins: BabelTestPlugin[] = [],
  filename?: string,
) =>
  Babel.transform(code, {
    filename,
    plugins: [...prePlugins, [babelPlugin, { ...defaultOptions, ...options }], ...postPlugins],
    parserOpts: { plugins: ['typescript'] },
  }).code;

export const rollupTransform = (
  code: string,
  options?: Options,
  prePlugins: Plugin[] = [],
  postPlugins: Plugin[] = [],
) =>
  rollup({
    input: 'code',
    plugins: [
      virtual({ code }),
      ...prePlugins,
      rollupPlugin({ ...defaultOptions, ...options }),
      ...postPlugins,
    ],
    external: ['typegpu', /^typegpu\/.*$/],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);

export type WebpackTestPlugin = NonNullable<Configuration['plugins']>[number];

async function createTempDir() {
  const ostmpdir = os.tmpdir();
  const tmpdir = path.join(ostmpdir, 'unplugin-typegpu-test-');
  return await fs.mkdtemp(tmpdir);
}

export const webpackTransform = async (
  code: string,
  options?: Options,
  prePlugins: WebpackTestPlugin[] = [],
  postPlugins: WebpackTestPlugin[] = [],
) => {
  const dir = await createTempDir();
  try {
    const input = join(dir, 'input.js');
    await writeFile(input, code);

    await new Promise<void>((resolve, reject) => {
      webpack(
        {
          entry: input,
          mode: 'development',
          devtool: 'source-map',
          output: { path: join(dir, 'dist'), filename: 'output.js' },
          plugins: [
            ...prePlugins,
            webpackPlugin({ ...defaultOptions, ...options }),
            ...postPlugins,
          ],
        },
        (err, stats) => {
          if (err || stats?.hasErrors()) {
            console.error(stats?.toString());
            reject(err || new Error('Webpack bundling failed'));
          } else {
            resolve();
          }
        },
      );
    });

    return await readFile(join(dir, 'dist', 'output.js'), 'utf-8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
