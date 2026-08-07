import { blankSpaces } from './core/whitespaces.ts';

/**
 * Regex for splitting code into tokens.
 * We don't separate every WGSL token, for example `main(){` already has no spaces, no need to split it.
 * Split if whitespace is encountered, or if either of [:,] is in lookahead.
 */
const splitRegex = new RegExp(`[${[...blankSpaces].join('')}]+|(?=[:,])`, 'ug');

/**
 * Regex for detecting tokens that require whitespace separators.
 * Exact match is not required, for example: `fn` should be separated from `main()`.
 */
const separatorNeededRegex = /[\p{XID_Continue}]+/u;

/**
 * This function accepts a code string, and returns equivalent code
 * with unnecessary whitespaces and comments removed.
 */
export function minify(code: string): string {
  // TODO(#2803): Remove comments.

  // Split into tokens.
  const tokens = code.split(splitRegex);

  // Join and separate if necessary.
  let result = '';
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i] as string;
    const next = tokens[i + 1] ?? '';

    result += current;
    if (current.match(separatorNeededRegex) && next.match(separatorNeededRegex)) {
      result += ' ';
    }
  }

  return result;
}
