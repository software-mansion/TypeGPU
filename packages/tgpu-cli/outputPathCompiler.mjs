// @ts-check

import path from 'node:path';

/**
 * @param {string} input
 * @param {string} output
 * @returns {(file: string) => string}
 */
export const createOutputPathCompiler = (input, output) => {
  return output.includes(path.sep)
    ? /\*\*\/.*\*.*/.test(output) // "**/" and "*" used in pattern
      ? (file) => {
          // retrieve what ** was matched as
          const dir = new RegExp(
            input
              .replace(/\*/g, '\\*')
              .replace('\\*\\*', '(?<dir>.*)')
              .replace('\\*', '.*'),
          ).exec(file)?.groups?.dir;

          const parsed = path.parse(file);
          return (
            parsed.dir.length === 0
              ? output.replace('**/', '')
              : output.replace('**', dir ?? parsed.dir)
          ).replace('*', parsed.name);
        }
      : (file) => output.replace('*', path.parse(file).name) // no "**"" placeholder, flattening to the same directory
    : (file) => {
        const parsed = path.parse(file);
        return path.join(parsed.dir, output.replace('*', parsed.name)); // no path separator -> output in the same directory as input
      };
};
