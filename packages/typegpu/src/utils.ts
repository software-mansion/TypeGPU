// AAA sprawdź czy te funkcje z testów są poprawne
// AAA range z nawiasami i potencjalnym typem zwracanym
// AAA dawaj tez typ zwracany

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
  const code = new ParsableString(strippedCode);
  const args: ArgInfo[] = [];

  while (!code.isFinished()) {
    // In each loop iteration, process all the attributes, the identifier and the type of a single argument.
    const attributes = [];
    while (code.isAt('@')) {
      const oldPos = code.pos;
      code.parseUntil(new Set(')'), false, ['(', ')']);
      code.advanceBy(1); // ')'
      attributes.push(code.str.slice(oldPos, code.pos));
    }

    const oldPos = code.pos;
    code.parseUntil(new Set([':', ',']), true);
    const identifier = code.str.slice(oldPos, code.pos);

    let maybeType;
    if (code.isAt(':')) {
      code.advanceBy(1); // colon before type
      const oldPos = code.pos;
      code.parseUntil(new Set(','), true, ['<', '>']);
      maybeType = code.str.slice(oldPos, code.pos);
    }
    args.push({
      identifier,
      attributes,
      type: maybeType,
    });

    code.advanceBy(1); // comma before the next argument
  }

  return { args, range: { begin: range[0], end: range[1] } };
}

// Strips comments, whitespaces, the name and the body of the function.
function strip(
  rawCode: string,
): { strippedCode: string; argRange: [number, number] } {
  let strippedCode = '';
  // assumption: the first opening parentheses is the beginning of the arguments list
  const code = new ParsableString(rawCode);
  const argsStart = code.parseUntil(new Set('(')) + 1;

  let openedParentheses = 0;
  while (!code.isFinished()) {
    // skip any blankspace
    if (code.isAt(blankSpaces)) {
      code.advanceBy(1); // the blankspace character
      continue;
    }

    // skip line comments
    if (code.isAt('//')) {
      code.advanceBy(2); // '//'
      code.parseUntil(lineBreaks);
      code.advanceBy(1); // the line break
      continue;
    }

    // skip block comments
    if (code.isAt('/*')) {
      code.parseUntil(new Set('*/'), false, ['/*', '*/']);
      code.advanceBy(2); // the last '*/'
      continue;
    }

    if (code.isAt('(')) {
      openedParentheses += 1;
    }

    if (code.isAt(')')) {
      openedParentheses -= 1;
      if (openedParentheses === 0) {
        return {
          strippedCode: strippedCode.slice(1),
          argRange: [argsStart, code.pos],
        };
      }
    }

    strippedCode += code.str[code.pos];
    code.advanceBy(1); // parsed character
  }
  throw new Error('Invalid wgsl code!');
}

class ParsableString {
  _pos: number;
  constructor(public readonly str: string) {
    this._pos = 0;
  }

  get pos() {
    return this._pos;
  }

  isFinished() {
    return this._pos >= this.str.length;
  }

  advanceBy(steps: number) {
    this._pos += steps;
  }

  isAt(substr: string | Set<string>): boolean {
    if (typeof substr === 'string') {
      for (let i = 0; i < substr.length; i++) {
        if (this.str[this._pos + i] !== substr[i]) {
          return false;
        }
      }
      return true;
    }
    for (const elem of substr) {
      if (this.isAt(elem)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param toFind a set of strings either of which satisfy the search,
   * @param allowEndOfString if set to true, the method returns `code.length` instead of throwing when it reaches the end of the string,
   * @param brackets a pair of brackets that has to be closed for result to be valid.
   */
  parseUntil(
    toFind: Set<string>,
    allowEndOfString = false,
    brackets?: [string, string],
  ): number {
    let openedBrackets = 0;
    while (this._pos < this.str.length) {
      if (brackets && this.isAt(brackets[0])) {
        openedBrackets += 1;
      }
      if (brackets && this.isAt(brackets[1])) {
        openedBrackets -= 1;
      }
      if (openedBrackets === 0) {
        if (this.isAt(toFind)) {
          return this._pos;
        }
      }
      this._pos += 1;
    }
    if (allowEndOfString && openedBrackets === 0) {
      return this.str.length;
    }
    throw new Error('Invalid wgsl syntax!');
  }
}
