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
    // In each loop iteration, process all the attributes, the identifier and the type of a single argument.
    const attributes = [];
    while (strippedCode[pos] === '@') {
      const { attribute, newPos } = processAttribute(strippedCode, pos);
      attributes.push(attribute);
      pos = newPos;
    }

    const { identifier, newPos } = processIdentifier(strippedCode, pos);
    pos = newPos;

    let maybeType;
    if (strippedCode[pos] === ':') {
      pos += 1; // colon before type
      const { type, newPos } = processType(strippedCode, pos);
      maybeType = type;
      pos = newPos;
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

// Strips comments, whitespaces, the name and the body of the function.
function strip(
  code: string,
): { strippedCode: string; argRange: [number, number] } {
  let strippedCode = '';
  // assumption: the first opening parentheses is the beginning of the arguments list
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
      pos = findEitherOf(code, pos, new Set('*/'), false, ['/*', '*/']);
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

function processAttribute(
  strippedCode: string,
  pos: number,
): { attribute: string; newPos: number } {
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
  return { attribute, newPos: lastParenthesesPos + 1 };
}

function processIdentifier(
  strippedCode: string,
  pos: number,
): { identifier: string; newPos: number } {
  const identifierSeparatorPos = findEitherOf(
    strippedCode,
    pos,
    new Set([':', ',']),
    true,
  );
  const identifier = strippedCode.slice(pos, identifierSeparatorPos);
  return { identifier, newPos: identifierSeparatorPos };
}

function processType(
  strippedCode: string,
  pos: number,
): { type: string; newPos: number } {
  const typeSeparatorPos = findEitherOf(
    strippedCode,
    pos,
    new Set(','),
    true,
    ['<', '>'],
  );
  const type = strippedCode.slice(pos, typeSeparatorPos);
  return { type, newPos: typeSeparatorPos };
}
