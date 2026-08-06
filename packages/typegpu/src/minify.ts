import { blankSpaces, lineBreaks } from './core/whitespaces.ts';

/**
 * Regex for splitting code into tokens.
 * We don't separate every WGSL token, for example `main(){` already has no spaces, no need to split it.
 * Split if whitespace is encountered, or if either of [:,] is in lookahead.
 */
const splitRegex = new RegExp(`[${[...blankSpaces].join('|')}]+|(?=[:,])`, 'ug');

/**
 * Regex for detecting tokens that require whitespace separators.
 * Exact match is not required, for example: `fn` should be separated from `main()`.
 */
const separatorNeededRegex = /[\p{XID_Continue}]+/u;

function stripWGSLComments(code: string): string {
  let result = '';
  let copiedUpTo = 0;
  let offset = 0;

  while (offset < code.length) {
    if (code.startsWith('//', offset)) {
      result += `${code.slice(copiedUpTo, offset)} `;
      offset += 2;

      while (offset < code.length && !lineBreaks.has(code.charAt(offset))) {
        offset += 1;
      }

      copiedUpTo = offset;
      continue;
    }

    if (code.startsWith('/*', offset)) {
      result += `${code.slice(copiedUpTo, offset)} `;
      let depth = 1;
      offset += 2;

      while (offset < code.length && depth > 0) {
        if (code.startsWith('/*', offset)) {
          depth += 1;
          offset += 2;
        } else if (code.startsWith('*/', offset)) {
          depth -= 1;
          offset += 2;
        } else {
          offset += 1;
        }
      }

      if (depth > 0) {
        throw new SyntaxError(`Unterminated block comment found during minification.`);
      }

      copiedUpTo = offset;
      continue;
    }

    offset += 1;
  }

  return result + code.slice(copiedUpTo);
}

/**
 * This function accepts a code string, and returns equivalent code
 * with unnecessary whitespaces and comments removed.
 */
export function minify(code: string): string {
  // Remove comments.
  const codeWithoutComments = stripWGSLComments(code);

  // Split into tokens.
  const tokens = codeWithoutComments.split(splitRegex);

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
