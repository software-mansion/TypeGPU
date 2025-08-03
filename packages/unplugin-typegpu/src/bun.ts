import type { BunPlugin } from 'bun';
import * as Babel from '@babel/standalone';
import { defaultOptions, type Options } from './common.ts';
import defu from 'defu';
import babelPlugin from './babel.ts';

const kernelDirectiveRegex = /["']kernel["']/;
const typegpuKeywordRegex = /typegpu/;

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

        // Quickly verifying if it's even worth it to parse and
        // transform (costly operator)
        // TODO: Add for other plugins, with an option to disable in case
        //       the early detection hinders transformation
        if (!kernelDirectiveRegex.test(text) && !typegpuKeywordRegex.test(text)) {
          // Early skip
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
