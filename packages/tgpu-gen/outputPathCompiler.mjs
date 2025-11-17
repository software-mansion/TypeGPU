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
          const matched = new RegExp(
            input.replace(/\*/g, '\\*').replace('\\*\\*', '(?<dir>.*)').replace('\\*', '.*'),
          ).exec(file);
          const dir = matched ? matched[1] : undefined;

          return (
            dir === undefined ? output.replace('**/', '') : output.replace('**', dir)
          ).replace('*', path.parse(file).name);
        }
      : (file) => output.replace('*', path.parse(file).name) // no "**"" placeholder, flattening to the same directory
    : (file) => {
        const parsed = path.parse(file);
        return path.join(parsed.dir, output.replace('*', parsed.name)); // no path separator -> output in the same directory as input
      };
};
