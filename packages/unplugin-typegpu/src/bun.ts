import type { BunPlugin } from 'bun';
import * as Babel from '@babel/standalone';
import defu from 'defu';
import { defaultOptions, earlyPruneRegex, type Options } from './common.ts';
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
    name: 'unplugin-typegpu',
    setup(build) {
      build.onLoad({ filter: include }, async (args) => {
        const text = await Bun.file(args.path).text();

        // Pruning early before more expensive operations
        if (earlyPruneRegex.every((pattern) => !pattern.test(text))) {
          return {
            contents: text,
            loader: args.loader,
          };
        }

        const result = Babel.transform(text, {
          presets: [['typescript', { allowDeclareFields: true }]],
          filename: args.path,
          plugins: [babelPlugin],
        }).code;

        return {
          contents: result ?? text,
          loader: args.loader,
        };
      });
    },
  };
};
