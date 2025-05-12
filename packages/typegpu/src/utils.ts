// AAA slice na znaki

const lineBreaks = new Set<string>([
  '\u000A', // line feed
  '\u000B', // vertical tab
  '\u000C', // form feed
  '\u000D', // carriage return
  '\u0085', // next line
  '\u2028', // line separator
  '\u2029', // paragraph separator
]);

const blankSpaces = new Set<string>([
  ...lineBreaks,
  '\u0020', // space
  '\u0009', // horizontal tab
  '\u200E', // left-to-right mark
  '\u200F', // right-to-left mark
]);

function isAt(code: string, pos: number, substr: string): boolean {
  for (let i = 0; i < substr.length; i++) {
    if (code[pos + i] !== substr[i]) {
      return false;
    }
  }
  return true;
}

/**
 * @param code the string to look through,
 * @param startAt first character to consider,
 * @param toFind a set of strings either of which satisfy the search,
 * @param allowEndOfString if set to true, the method returns `code.length` instead of throwing when it reaches the end of the string,
 * @param brackets a pair of brackets that has to be closed for result to be valid.
 */
function findEitherOf(
  code: string,
  startAt: number,
  toFind: Set<string>,
  allowEndOfString = false,
  brackets?: [string, string],
): number {
  let openedBrackets = 0;
  let pos = startAt;
  while (pos < code.length) {
    if (brackets && isAt(code, pos, brackets[0])) {
      openedBrackets += 1;
    }
    if (brackets && isAt(code, pos, brackets[1])) {
      openedBrackets -= 1;
    }
    if (openedBrackets === 0) {
      for (const s of toFind) {
        if (isAt(code, pos, s)) {
          return pos;
        }
      }
    }
    pos += 1;
  }
  if (allowEndOfString && openedBrackets === 0) {
    return code.length;
  }
  throw new Error('Invalid wgsl syntax!');
}

// Strips comments, whitespaces, name and body of the function,
// then wraps the result in `specialCharacter` from the beginning and the end.
function strip(
  code: string,
): { strippedCode: string; argRange: [number, number] } {
  let strippedCode = '';
  const argsStart = code.indexOf('(') + 1;

  let pos = argsStart;
  let openedParentheses = 1;
  while (pos < code.length) {
    // skip any blankspace
    if (blankSpaces.has(code[pos] as string)) {
      pos += 1; // the whitespace character
      continue;
    }

    // skip line comments
    if (isAt(code, pos, '//')) {
      pos += 2; // '//'
      pos = findEitherOf(code, pos, lineBreaks);
      pos += 1; // the line break
      continue;
    }

    // skip block comments
    if (isAt(code, pos, '/*')) {
      pos = findEitherOf(code, pos, new Set('*/'), false, [
        '/*',
        '*/',
      ]);
      pos += 2; // the last '*/'
      continue;
    }

    if (code[pos] === '(') {
      openedParentheses += 1;
    }

    if (code[pos] === ')') {
      openedParentheses -= 1;
      if (openedParentheses === 0) {
        return { strippedCode, argRange: [argsStart, pos] };
      }
    }

    strippedCode += code[pos];
    pos += 1;
  }
  throw new Error('Invalid wgsl code!');
}

interface ArgInfo {
  identifier: string;
  attributes: string[];
  type: string | undefined;
}

interface FunctionArgsInfo {
  args: ArgInfo[];
  range: {
    begin: number;
    end: number;
  };
}

export function extractArgs(rawCode: string): FunctionArgsInfo {
  const { strippedCode, argRange: range } = strip(rawCode);
  const args: ArgInfo[] = [];

  let pos = 0;
  while (pos < strippedCode.length) {
    const attributes = [];
    while (strippedCode[pos] === '@') {
      const lastParenthesesPos = findEitherOf(
        strippedCode,
        pos,
        new Set(')'),
        false,
        ['(', ')'],
      );
      const attribute = strippedCode.slice(
        pos,
        lastParenthesesPos + 1,
      );
      attributes.push(attribute);
      pos = lastParenthesesPos;
      pos += 1; // ')'
    }

    const identifierSeparatorPos = findEitherOf(
      strippedCode,
      pos,
      new Set([':', ',']),
      true,
    );
    const identifier = strippedCode.slice(
      pos,
      identifierSeparatorPos,
    );
    pos = identifierSeparatorPos;

    let maybeType;
    if (strippedCode[pos] === ':') {
      pos += 1; // colon before type
      const typeSeparatorPos = findEitherOf(
        strippedCode,
        pos,
        new Set(','),
        true,
        ['<', '>'],
      );
      maybeType = strippedCode.slice(
        pos,
        typeSeparatorPos,
      );
      pos = typeSeparatorPos;
    }
    args.push({
      identifier,
      attributes,
      type: maybeType,
    });

    pos += 1; // comma before the next argument
  }

  return { args, range: { begin: range[0], end: range[1] } };
}
