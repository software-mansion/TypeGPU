/**
 * Two consecutive tokens with non-empty match this should have space in between.
 * Exact match is not required, for example: `fn` should be separated from `main()`.
 */
const separableToken = /[\p{XID_Continue}]+/u;

/**
 * This function accepts a code string, and returns equivalent code
 * with unnecessary whitespaces and comments removed.
 */
export function minify(code: string): string {
  // Split into tokens.
  // Split if whitespace is encountered, or if either of [:,] is in lookahead.
  const tokens = code.split(/\s+|(?=[:,])/);

  // Join and separate if necessary.
  let result = '';
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i] as string;
    const next = tokens[i + 1] ?? '';

    result += current;
    if (current.match(separableToken) && next.match(separableToken)) {
      result += ' ';
    }
  }

  return result;
}
