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

/**
 * Replaces WGSL comments with spaces while preserving line breaks and offsets.
 *
 * Based on the implementation of Tint.
 */
export function stripWGSLComments(code: string): string {
  const output = code.split(''); // dealing with UTF-16 codes
  let offset = 0;

  const rejectNullCharacter = () => {
    if (code.charCodeAt(offset) === 0) {
      throw new SyntaxError(`NULL character found during minification.`);
    }
  };

  while (offset < code.length) {
    rejectNullCharacter();

    if (code.startsWith('//', offset)) {
      output[offset] = ' ';
      output[offset + 1] = ' ';
      offset += 2;

      while (offset < code.length && !lineBreaks.has(code.charAt(offset))) {
        rejectNullCharacter();
        output[offset] = ' ';
        offset += 1;
      }
      continue;
    }

    if (code.startsWith('/*', offset)) {
      const commentStart = offset;
      let depth = 1;

      output[offset] = ' ';
      output[offset + 1] = ' ';
      offset += 2;

      while (offset < code.length && depth > 0) {
        rejectNullCharacter();

        if (code.startsWith('/*', offset)) {
          output[offset] = ' ';
          output[offset + 1] = ' ';
          offset += 2;
          depth += 1;
        } else if (code.startsWith('*/', offset)) {
          output[offset] = ' ';
          output[offset + 1] = ' ';
          offset += 2;
          depth -= 1;
        } else {
          if (!lineBreaks.has(code.charAt(offset))) {
            output[offset] = ' ';
          }
          offset += 1;
        }
      }

      if (depth > 0) {
        throw new SyntaxError(`Unterminated block comment found during minification.`);
      }
      continue;
    }

    offset += 1;
  }

  return output.join('');
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
