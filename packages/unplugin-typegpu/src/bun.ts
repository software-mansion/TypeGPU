import type { BunPlugin } from 'bun';
import * as Babel from '@babel/standalone';
import presetTypeScript from '@babel/preset-typescript';
import { defaultOptions, type Options } from './common.ts';
import defu from 'defu';
import babelPlugin from './babel.ts';

export default (rawOptions: Options): BunPlugin => {
  const options = defu(rawOptions, defaultOptions);
  const include = options.include;
  if (!(include instanceof RegExp)) {
    throw new Error(
      `Unsupported 'include' options in Bun plugin. Please provide a single regular expression`,
    );
  }
  if (options.exclude) {
    throw new Error(`Unsupported 'exclude' option in Bun plugin`);
  }

  return {
    name: 'TypeGPU',
    setup(build) {
      build.onLoad({ filter: include }, async (args) => {
        const text = await Bun.file(args.path).text();

        const result = Babel.transform(text, {
          presets: [['typescript', { allowDeclareFields: true }]],
          filename: 'example.ts',
          // plugins: [babelPlugin],
        }).code;

        return {
          contents:
            `console.log('This module has been transformed by TypeGPU: ${args.path}'); ${result}`,
          loader: args.loader,
        };
      });
    },
  };
};
