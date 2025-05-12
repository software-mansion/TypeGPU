// AAA slice na znaki

const blankSpaces = new Set<string>([
  '\u0020', // space
  '\u0009', // horizontal tab
  '\u200E', // left-to-right mark
  '\u200F', // right-to-left mark
]);

const lineBreaks = new Set<string>([
  '\u000A', // line feed
  '\u000B', // vertical tab
  '\u000C', // form feed
  '\u000D', // carriage return
  '\u0085', // next line
  '\u2028', // line separator
  '\u2029', // paragraph separator
]);

// function isAt(code: string, position: number, substr: string): boolean {
//   for (let i = 0; i < substr.length; i++) {
//     if (code[position + i] !== substr[i]) {
//       return false;
//     }
//   }
//   return true;
// }

// /**
//  * @param code the string to look through,
//  * @param startAt first character to consider,
//  * @param toFind a set of strings either of which satisfy the search,
//  * @param brackets a pair of brackets that has to be closed for result to be valid.
//  */
// function findEitherOf(
//   code: string,
//   startAt: number,
//   toFind: Set<string>,
//   brackets?: [string, string],
// ): [string, number] | undefined {
//   let openedBrackets = 0;
//   let position = startAt;
//   while (position < code.length) {
//     if (brackets && code[position] === brackets[0]) {
//       openedBrackets += 1;
//     }
//     if (brackets && code[position] === brackets[1]) {
//       openedBrackets -= 1;
//     }
//     for (const s of toFind) {
//       if (isAt(code, position, s)) {
//         return [s, position];
//       }
//     }
//   }
//   return undefined;
// }

function findNextLineBreak(code: string, startAt: number): number {
  for (let i = startAt; i < code.length; i++) {
    if (lineBreaks.has(code[i] as string)) {
      return i;
    }
  }
  return code.length;
}

function findNextBlockComment(code: string, startAt: number): number {
  for (let i = startAt; i < code.length; i++) {
    if (['/*', '*/'].includes(code.slice(i, i + 2))) {
      return i;
    }
  }
  return code.length;
}

// strips comments, whitespaces, name and body of the function
function strip(
  code: string,
): { strippedCode: string; argRange: [number, number] } {
  let strippedCode = '';
  const argsStart = code.indexOf('(') + 1;

  let position = argsStart;
  let openedParentheses = 1;
  while (position < code.length) {
    // skip any blankspace
    if (
      blankSpaces.has(code[position] as string) ||
      lineBreaks.has(code[position] as string)
    ) {
      position += 1;
      continue;
    }

    // skip line comments
    if (code.slice(position, position + 2) === '//') {
      position = findNextLineBreak(code, position + 2) + 1;
      continue;
    }

    // skip block comments
    if (code[position] === '/' && code[position + 1] === '*') {
      position += 2;
      let nestedBlocks = 1;
      while (position < code.length && nestedBlocks > 0) {
        position = findNextBlockComment(code, position);
        if (code.slice(position, position + 2) === '/*') {
          nestedBlocks += 1;
        } else {
          nestedBlocks -= 1;
        }
        position += 2;
      }
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

function extractAttribute(
  code: string,
  startAt: number,
): { attribute: string; endPosition: number } {
  // the attribute ends when we close all opened parentheses
  let position = startAt;
  let openedParentheses = 0;
  while (position < code.length) {
    if (code[position] === '(') {
      openedParentheses += 1;
    }
    if (code[position] === ')') {
      openedParentheses -= 1;
      if (openedParentheses === 0) {
        return {
          attribute: code.slice(startAt, position + 1),
          endPosition: position + 1,
        };
      }
    }
    position += 1;
  }
  throw new Error('Invalid wgsl code!');
}

function extractIdentifier(
  code: string,
  startAt: number,
): { identifier: string; endPosition: number } {
  // the identifier ends when we see a colon, a comma or a closing parenthesis
  let position = startAt;
  while (true) {
    if (
      position >= code.length || [',', ':'].includes(code[position] as string)
    ) {
      return {
        identifier: code.slice(startAt, position),
        endPosition: position,
      };
    }
    position += 1;
  }
}

function extractType(
  code: string,
  startAt: number,
): { type: string; endPosition: number } {
  // the type ends when we see a comma or a closing parenthesis and no angle brackets are open
  let position = startAt;
  let openedBrackets = 0;
  while (true) {
    if (code[position] === '<') {
      openedBrackets += 1;
    }
    if (code[position] === '>') {
      openedBrackets -= 1;
    }
    if (
      (position >= code.length || ',' === (code[position] as string)) &&
      openedBrackets === 0
    ) {
      return {
        type: code.slice(startAt, position),
        endPosition: position,
      };
    }
    position += 1;
  }
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

export function extractArgs(
  code: string,
): FunctionArgsInfo {
  const { strippedCode, argRange: range } = strip(code);
  console.log('POST STRIP');
  const args: ArgInfo[] = [];

  console.log(strippedCode);
  let position = 0;
  while (position < strippedCode.length) {
    console.log('MAIN LOOP', position);
    const attributes = [];
    while (strippedCode[position] === '@') {
      console.log('ATTR LOOP', position);
      const { attribute, endPosition } = extractAttribute(
        strippedCode,
        position,
      );
      attributes.push(attribute);
      position = endPosition;
    }

    console.log('IDENT', position);
    const { identifier, endPosition } = extractIdentifier(
      strippedCode,
      position,
    );
    position = endPosition;

    let maybeType;
    if (strippedCode[position] === ':') {
      position += 1;
      console.log('TYPE', position);
      const { type, endPosition } = extractType(
        strippedCode,
        position,
      );
      maybeType = type;
      position = endPosition;
    }
    args.push({
      identifier,
      attributes,
      type: maybeType,
    });
  }

  console.log(args);

  return { args, range: { begin: range[0], end: range[1] } };
}
