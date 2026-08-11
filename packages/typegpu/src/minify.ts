import { blankSpaces, lineBreaks } from './core/whitespaces.ts';
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

    result += current;
    if (isSpaceRequired(current, next)) {
      result += ' ';
    }
  }

  return result;
}

function isSpaceRequired(current: string | undefined, next: string | undefined) {
  const currentLast = current?.at(-1);
  const nextFirst = next?.at(0) ?? ' ';

  invariant(
    currentLast?.length === 1 && nextFirst.length === 1,
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
