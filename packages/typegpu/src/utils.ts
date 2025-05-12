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

function isAt(code: string, position: number, substr: string): boolean {
  for (let i = 0; i < substr.length; i++) {
    if (code[position + i] !== substr[i]) {
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
  let position = startAt;
  while (position < code.length) {
    if (brackets && isAt(code, position, brackets[0])) {
      openedBrackets += 1;
    }
    if (brackets && isAt(code, position, brackets[1])) {
      openedBrackets -= 1;
    }
    if (openedBrackets === 0) {
      for (const s of toFind) {
        if (isAt(code, position, s)) {
          return position;
        }
      }
    }
    position += 1;
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

  let position = argsStart;
  let openedParentheses = 1;
  while (position < code.length) {
    // skip any blankspace
    if (blankSpaces.has(code[position] as string)) {
      position += 1; // the whitespace character
      continue;
    }

    // skip line comments
    if (isAt(code, position, '//')) {
      position += 2; // '//'
      position = findEitherOf(code, position, lineBreaks);
      position += 1; // the line break
      continue;
    }

    // skip block comments
    if (isAt(code, position, '/*')) {
      position = findEitherOf(code, position, new Set('*/'), false, [
        '/*',
        '*/',
      ]);
      position += 2; // the last '*/'
      continue;
    }

    if (code[position] === '(') {
      openedParentheses += 1;
    }

    if (code[position] === ')') {
      openedParentheses -= 1;
      if (openedParentheses === 0) {
        return { strippedCode, argRange: [argsStart, position] };
      }
    }

    strippedCode += code[position];
    position += 1;
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

class ArgumentExtractor {
  position: number;
  constructor(private readonly rawCode: string) {
    this.position = 0;
  }

  extract(): FunctionArgsInfo {
    const { strippedCode, argRange: range } = strip(this.rawCode);
    const args: ArgInfo[] = [];

    while (this.position < strippedCode.length) {
      const attributes = [];
      while (strippedCode[this.position] === '@') {
        const lastParenthesesPosition = findEitherOf(
          strippedCode,
          this.position,
          new Set(')'),
          false,
          ['(', ')'],
        );
        const attribute = strippedCode.slice(
          this.position,
          lastParenthesesPosition + 1,
        );
        attributes.push(attribute);
        this.position = lastParenthesesPosition;
        this.position += 1; // ')'
      }

      const identifierSeparatorPosition = findEitherOf(
        strippedCode,
        this.position,
        new Set([':', ',']),
        true,
      );
      const identifier = strippedCode.slice(
        this.position,
        identifierSeparatorPosition,
      );
      this.position = identifierSeparatorPosition;

      let maybeType;
      if (strippedCode[this.position] === ':') {
        this.position += 1; // colon before type
        const typeSeparatorPosition = findEitherOf(
          strippedCode,
          this.position,
          new Set(','),
          true,
          ['<', '>'],
        );
        maybeType = strippedCode.slice(
          this.position,
          typeSeparatorPosition,
        );
        this.position = typeSeparatorPosition;
      }
      args.push({
        identifier,
        attributes,
        type: maybeType,
      });

      this.position += 1; // comma before the next argument
    }

    return { args, range: { begin: range[0], end: range[1] } };
  }
}

export function extractArgs(code: string): FunctionArgsInfo {
  const extractor = new ArgumentExtractor(code);
  return extractor.extract();
}
