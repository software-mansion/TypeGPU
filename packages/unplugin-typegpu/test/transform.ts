import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rollup } from 'rollup';
import webpack from 'webpack';
import VirtualModulesPlugin from 'webpack-virtual-modules';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/common.ts';
import rollupPlugin from '../src/rollup.ts';
import webpackPlugin from '../src/webpack.ts';

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
    plugins: [
      virtual({ code }),
      rollupPlugin({ ...defaultOptions, ...options }),
    ],
    external: ['typegpu', /^typegpu\/.*$/],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);

export const webpackTransform = (
  code: string,
  options?: Options,
): Promise<string> => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'typegpu-webpack-test-'));
  const entryPath = join(tmpDir, 'entry.js');
  writeFileSync(entryPath, code);

  return new Promise((resolve, reject) => {
    const compiler = webpack({
      entry: entryPath,
      output: {
        path: tmpDir,
        filename: 'bundle.js',
        library: { type: 'module' },
      },
      experiments: {
        outputModule: true,
      },
      externalsType: 'module',
      externals: [
        (
          { request }: { request?: string },
          callback: (err: null, result?: string) => void,
        ) => {
          if (request === 'typegpu' || request?.startsWith('typegpu/')) {
            callback(null, request);
          } else {
            callback(null);
          }
        },
      ],
      plugins: [
        webpackPlugin({
          ...defaultOptions,
          ...options,
        }) as webpack.WebpackPluginInstance,
      ],
      mode: 'none',
      devtool: false,
    });

    compiler.run((err, stats) => {
      compiler.close(() => {});
      const cleanup = () => rmSync(tmpDir, { recursive: true, force: true });

      if (err) {
        cleanup();
        reject(err);
        return;
      }

      if (stats?.hasErrors()) {
        cleanup();
        reject(new Error(stats.toString({ errors: true })));
        return;
      }

      try {
        const result = readFileSync(join(tmpDir, 'bundle.js'), 'utf-8');
        cleanup();
        resolve(result);
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  });
};
