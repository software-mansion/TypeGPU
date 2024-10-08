// @ts-check

import path from 'node:path';

/**
 * @param { string } input
 * @param { string } output
 * @returns {(file: string) => string}
 */
export const createOutputPathCompiler = (input, output) =>
  output.includes(path.sep)
    ? /\*\*\/.*\*.*/.test(output)
      ? (file) => {
          const parsed = path.parse(file);
          return (
            parsed.dir.length === 0
              ? output.replace('**/', '')
              : output.replace('**', parsed.dir)
          ).replace('*', parsed.name);
        }
      : (file) => output.replace('*', path.parse(file).name)
    : (file) => {
        const parsed = path.parse(file);
        return path.join(parsed.dir, output.replace('*', parsed.name));
      };
