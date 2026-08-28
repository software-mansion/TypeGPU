import { blankSpaces, stripWGSLComments } from './rawShaderCodeUtils.ts';
import { invariant } from './errors.ts';

/**
 * We don't separate every WGSL token, for example `main()` already has no spaces, no need to further split it.
 */
const splitRegex = new RegExp(`[${[...blankSpaces].join('')}]+`, 'ug');

/**
 * Regex for detecting boundary characters that indicate whitespace may be needed between tokens.
 * @example
 * "let", "variable" // "t" and "v" both match, a space is needed
 * "return" "a" // "n" and "a" both match, a space is needed
 * "return" "(a+b)" // "n" matches and "(" does not, no space is needed
 */
const separatorNeededRegex = /[.\p{XID_Continue}]/u;

/**
 * This function accepts a code string, and returns equivalent code
 * with comments and unnecessary whitespace removed.
 */
export function minify(code: string): string {
  const codeWithoutComments = stripWGSLComments(code);

  const tokens = codeWithoutComments.split(splitRegex).filter((token) => token !== '');

  let result = '';
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];

    invariant(current);

    result += current;
    if (isSpaceRequired(current, next)) {
      result += ' ';
    }
  }

  return result;
}

function isSpaceRequired(current: string, next: string | undefined) {
  if (next === undefined) {
    return false;
  }
  const currentLast = current.at(-1);
  const nextFirst = next.at(0);

  invariant(
    currentLast?.length === 1 && nextFirst?.length === 1,
    `Expected tokens during minification to not be empty.`,
  );

  if (separatorNeededRegex.test(currentLast) && separatorNeededRegex.test(nextFirst)) {
    return true;
  }
  if (['//', '/*', '*/'].includes(`${currentLast}${nextFirst}`)) {
    return true;
  }
  return false;
}
