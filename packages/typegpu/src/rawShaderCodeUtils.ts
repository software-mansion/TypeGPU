export const lineBreaks = new Set<string>([
  '\u000A', // line feed
  '\u000B', // vertical tab
  '\u000C', // form feed
  '\u000D', // carriage return
  '\u0085', // next line
  '\u2028', // line separator
  '\u2029', // paragraph separator
]);

export const blankSpaces = new Set<string>([
  ...lineBreaks,
  '\u0020', // space
  '\u0009', // horizontal tab
  '\u200E', // left-to-right mark
  '\u200F', // right-to-left mark
]);

export const anyIdent = /([$_\p{XID_Start}][$\p{XID_Continue}]*)/u; // WGSL ident, modified to include $

// Based on tint implementation.
export function stripWGSLComments(code: string): string {
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
        throw new SyntaxError(`Found block comment opening without corresponding closing.`);
      }

      copiedUpTo = offset;
      continue;
    }

    if (code.startsWith('*/', offset)) {
      throw new SyntaxError(`Found block comment closing without corresponding opening.`);
    }

    offset += 1;
  }

  return result + code.slice(copiedUpTo);
}

function swapChars(source: string, offset: number, replacement: string) {
  return source.slice(0, offset) + replacement + source.slice(offset + replacement.length);
}

/**
 * Same as `stripWGSLComments`, but keeps all non-comment code at
 * the same location where it originally was, and replaces the comments
 * with whitespace.
 */
export function blankOutWGSLComments(code: string): string {
  let result = code;
  let offset = 0;

  while (offset < code.length) {
    if (code.startsWith('//', offset)) {
      result = swapChars(result, offset, '  ');
      offset += 2;

      while (offset < code.length && !lineBreaks.has(code.charAt(offset))) {
        result = swapChars(result, offset, ' ');
        offset += 1;
      }

      continue;
    }

    if (code.startsWith('/*', offset)) {
      let depth = 1;
      result = swapChars(result, offset, '  ');
      offset += 2;

      while (offset < code.length && depth > 0) {
        if (code.startsWith('/*', offset)) {
          depth += 1;
          result = swapChars(result, offset, '  ');
          offset += 2;
        } else if (code.startsWith('*/', offset)) {
          depth -= 1;
          result = swapChars(result, offset, '  ');
          offset += 2;
        } else {
          result = swapChars(result, offset, ' ');
          offset += 1;
        }
      }

      if (depth > 0) {
        throw new SyntaxError(`Found block comment opening without corresponding closing.`);
      }

      continue;
    }

    if (code.startsWith('*/', offset)) {
      throw new SyntaxError(`Found block comment closing without corresponding opening.`);
    }

    offset += 1;
  }

  return result;
}

export function extractIdentifierLikeTokens(source: string): string[] {
  // Adding a space at the beginning of `source` so all potential identifiers
  // have a preceeding character (see the regex for more context).
  const noCommentsSource = stripWGSLComments(' ' + source);
  // Capturing the preceeding character (irrespective of whitespace) to make sure that it's not a
  // chained member access, nor a typed numeric literal (e.g. 1f)
  const expr = new RegExp(`[^\\d]\\s*${anyIdent.source}`, 'ug');

  const identifiers: string[] = [];

  let result: RegExpExecArray | null;
  while ((result = expr.exec(noCommentsSource)) !== null) {
    if (result[0][0] === '.') {
      // Skipping member accesses.
      continue;
    }

    if (result[1]) {
      identifiers.push(result[1]);
    }
  }

  return identifiers;
}

export function renameIdentifiers(_source: string, renames: Map<string, string>) {
  // Adding a space at the beginning of `source` so all potential identifiers
  // have a preceeding character (see the regex for more context).
  const source = ' ' + _source;
  const noCommentsSource = blankOutWGSLComments(source);
  // Capturing the preceeding character (irrespective of whitespace) to make sure that it's not a
  // chained member access, nor a typed numeric literal (e.g. 1f)
  const expr = new RegExp(`[^\\d]\\s*${anyIdent.source}`, 'ug');

  let replaced = '';
  let copiedUpTo = 0;

  let result: RegExpExecArray | null;
  while ((result = expr.exec(noCommentsSource)) !== null) {
    if (result[0][0] === '.') {
      // Skipping member accesses.
      continue;
    }

    const identifier = result[1]?.trim();
    if (!identifier) {
      continue;
    }

    const end = result.index + result[0].length;
    // counting back from the end to keep any extra whitespace that was there
    const start = end - identifier.length;
    replaced += source.slice(copiedUpTo, start);
    replaced += renames.get(identifier) ?? identifier;
    copiedUpTo = end;
  }

  // Removing the first space we added at the beginning
  return (replaced + source.slice(copiedUpTo)).slice(1);
}

const firstNewlineAndIndentRegex = /\n\s*/;
const lastWhitespaceAndBrace = /\n\s*}$/;

/**
 * Assumes the second line's indentation to be the baseline for the
 * function's body, and updates all but the last line to match.
 */
export function normalizeIndentation(source: string): string {
  const trimmed = source.trim();
  const baseline = firstNewlineAndIndentRegex.exec(trimmed);

  if (!baseline) {
    return trimmed;
  }

  return trimmed.replaceAll(baseline[0], '\n  ').replace(lastWhitespaceAndBrace, '\n}');
}
