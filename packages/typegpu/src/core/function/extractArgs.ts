interface FunctionArgsInfo {
  args: ArgInfo[];
  ret: ReturnInfo | undefined;
  range: {
    begin: number;
    end: number;
  };
}

interface ArgInfo {
  identifier: string;
  attributes: string[];
  type: string | undefined;
}

interface ReturnInfo {
  attributes: string[];
  type: string;
}

/**
 * Extracts info about arguments of a given WGSL function string.
 * @example
 * const code = `
 *   fn add(a: i32, ＠location(0) b: i32, c) -> i32 {
 *     return a + b + c;
 *   }`;
 *
 * extractArgs(code);
 * // {
 * //   args: [
 * //     { identifier: 'a', attributes: [], type: 'i32' },
 * //     { identifier: 'b', attributes: ['＠location(0)'], type: 'i32' },
 * //     { identifier: 'c', attributes: [], type: undefined }
 * //   ],
 * //   ret: { type: 'i32', attributes: [] },
 * //   range: { begin: 11, end: 51 }
 * // }
 */
export function extractArgs(rawCode: string): FunctionArgsInfo {
  const { strippedCode, argRange: range } = strip(rawCode);
  const code = new ParsableString(strippedCode);
  code.consume('(');

  const args: ArgInfo[] = [];
  while (!code.isAt(')')) {
    // In each loop iteration, process all the attributes, the identifier and the potential type of a single argument.

    const attributes = [];
    while (code.isAt('@')) {
      code.parseUntil(closingParenthesis, parentheses);
      code.consume(')');
      attributes.push(code.lastParsed);
    }

    code.parseUntil(identifierEndSymbols);
    const identifier = code.lastParsed;

    let maybeType: string | undefined;
    if (code.isAt(':')) {
      code.consume(':');
      code.parseUntil(typeEndSymbols, angleBrackets);
      maybeType = code.lastParsed;
    }

    args.push({
      identifier,
      attributes,
      type: maybeType,
    });

    if (code.isAt(',')) {
      code.consume(',');
    }
  }
  code.consume(')');

  let maybeRet: ReturnInfo | undefined;
  if (code.isAt('->')) {
    code.consume('->');

    const attributes = [];
    while (code.isAt('@')) {
      code.parseUntil(closingParenthesis, parentheses);
      code.consume(')');
      attributes.push(code.lastParsed);
    }

    maybeRet = { type: code.str.slice(code.pos), attributes };
  }

  return {
    args,
    ret: maybeRet,
    range: { begin: range[0], end: range[1] },
  };
}

/**
 * Strips comments, whitespaces, the name and the body of the function.
 * @example
 * const code = `
 *    fn add( a,  // first argument
 *            ＠location(0) b : i32 ) -> i32   {
 *        return a + b; // returns the sum
 *  }`;
 *
 * strip(code); // "(a,@location(0)b:i32)->i32"
 */
function strip(rawCode: string): { strippedCode: string; argRange: [number, number] } {
  const code = new ParsableString(rawCode);
  let strippedCode = '';
  let argsStart: number | undefined;

  while (!code.isFinished()) {
    // parse character by character while ignoring comments and blankspaces until you find a `{`.

    // skip any blankspace
    if (code.isAt(blankSpaces)) {
      code.advanceBy(1); // the blankspace character
      continue;
    }

    // skip line comments
    if (code.isAt('//')) {
      code.consume('//');
      code.parseUntil(lineBreaks);
      code.advanceBy(1); // the line break
      continue;
    }

    // skip block comments
    if (code.isAt('/*')) {
      code.parseUntil(openingCommentBlock, commentBlocks);
      code.consume('*/');
      continue;
    }

    if (code.isAt('{')) {
      return {
        strippedCode,
        argRange: [argsStart as number, code.pos],
      };
    }

    if (code.isAt('(') && argsStart === undefined) {
      argsStart = code.pos;
    }

    if (argsStart !== undefined) {
      strippedCode += code.str[code.pos];
    }
    code.advanceBy(1); // parsed character
  }
  throw new Error('Invalid wgsl code!');
}

class ParsableString {
  #parseStartPos: number | undefined;
  #pos: number;
  constructor(public readonly str: string) {
    this.#pos = 0;
  }

  get pos(): number {
    return this.#pos;
  }

  /**
   * This property is equivalent to the substring of `this.str`
   * from the position of the last `parseUntil` call, to the current position.
   */
  get lastParsed(): string {
    if (this.#parseStartPos === undefined) {
      throw new Error('Parse was not called yet!');
    }
    return this.str.slice(this.#parseStartPos, this.pos);
  }

  isFinished() {
    return this.#pos >= this.str.length;
  }

  isAt(substr: string | Set<string>): boolean {
    if (typeof substr === 'string') {
      for (let i = 0; i < substr.length; i++) {
        if (this.str[this.#pos + i] !== substr[i]) {
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
   * @param toFind a set of strings either of which satisfy the search.
   * @param brackets a pair of brackets that has to be closed for result to be valid. This includes the found character(s).
   * @example
   * // internal state:
   * // '(@attribute(0) identifier: type)'
   * //   ^
   * this.parse(new Set(')'), ['(', ')']);
   * // internal state:
   * // '(@attribute(0) identifier: type)'
   * //               ^
   */
  parseUntil(toFind: Set<string>, brackets?: readonly [string, string]): number {
    this.#parseStartPos = this.#pos;
    let openedBrackets = 0;
    while (this.#pos < this.str.length) {
      if (brackets && this.isAt(brackets[0])) {
        openedBrackets += 1;
      }
      if (brackets && this.isAt(brackets[1])) {
        openedBrackets -= 1;
      }
      if (openedBrackets === 0) {
        if (this.isAt(toFind)) {
          return this.#pos;
        }
      }
      this.#pos += 1;
    }
    throw new Error('Reached the end of the string without finding a match!');
  }

  advanceBy(steps: number) {
    this.#pos += steps;
  }

  consume(str: string): void {
    if (!this.isAt(str)) {
      throw new Error(
        `Expected '${str}' at position ${this.#pos}, but found '${this.str.slice(
          this.#pos,
          this.#pos + str.length,
        )}'`,
      );
    }
    this.advanceBy(str.length);
  }
}

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
const closingParenthesis = new Set<string>([')']);
const identifierEndSymbols = new Set([':', ',', ')']);
const typeEndSymbols = new Set([',', ')']);
const openingCommentBlock = new Set(['*/']);

const parentheses = ['(', ')'] as const;
const angleBrackets = ['<', '>'] as const;
const commentBlocks = ['/*', '*/'] as const;
