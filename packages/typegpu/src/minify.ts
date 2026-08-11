import { blankSpaces, lineBreaks } from './core/whitespaces.ts';
import { invariant } from './errors.ts';

/**
 * Regex for splitting code into tokens.
 * We don't separate every WGSL token, for example `main()` already has no spaces, no need to further split it.
 * Split if whitespace is encountered, or if either of [:,;] is in lookahead.
 */
const splitRegex = new RegExp(`[${[...blankSpaces].join('')}]+`, 'ug');

/**
 * Regex for detecting boundary characters that indicate whitespace may be needed between tokens.
 * @example
 * "let", "variable" // "t" and "v" both match, a space is needed
 * "return" "a" // "n" and "t" both match, a space is needed
 * "return" "(a+b)" // "n" matches and "(" does not, no space is needed
 */
const separatorNeededRegex = /[.\p{XID_Continue}]/u;

/**
 * This function accepts a code string, and returns equivalent code
 * with unnecessary whitespace removed.
 */
export function minify(code: string): string {
  // Remove comments.
  const codeWithoutComments = stripWGSLComments(code);

  // Split into tokens.
  const tokens = codeWithoutComments.split(splitRegex).filter((token) => token !== '');

  // Join and separate if necessary.
  let result = '';
  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const currentLast = current?.at(-1);
    const nextFirst = tokens[i + 1]?.at(0) ?? ' ';

    invariant(currentLast, `Expected tokens during minification to not be empty.`);

    result += current;
    if (separatorNeededRegex.test(currentLast) && separatorNeededRegex.test(nextFirst)) {
      result += ' ';
    }
  }

  return result;
}

// Based on tint implementation.
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
        throw new SyntaxError(
          `Block comment opening without corresponding closing found during minification.`,
        );
      }

      copiedUpTo = offset;
      continue;
    }

    if (code.startsWith('*/', offset)) {
      throw new SyntaxError(
        `Block comment closing without corresponding opening found during minification.`,
      );
    }

    offset += 1;
  }

  return result + code.slice(copiedUpTo);
}
