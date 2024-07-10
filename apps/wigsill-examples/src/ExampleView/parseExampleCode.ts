import { mapToObj, pipe } from 'remeda';
import { ExampleMetadata } from './types';

const SyntaxTokens = ['import', 'from', '{', '}', ',', ';', '*', 'as'] as const;

type TokenPosition = { start: number; end: number };
type IdentifierToken = TokenPosition & { id: string };
type LiteralToken = TokenPosition & { literal: string };

type ImportStatementToken =
  | (TokenPosition & { value: (typeof SyntaxTokens)[number] })
  | IdentifierToken
  | LiteralToken;

function isIdentifier(token: unknown): token is IdentifierToken {
  return !!token && typeof token === 'object' && 'id' in token;
}

function isLiteral(token: unknown): token is LiteralToken {
  return !!token && typeof token === 'object' && 'literal' in token;
}

export const tokenizeImportStatement = (
  str: string,
): ImportStatementToken[] => {
  const tokens: ImportStatementToken[] = [];
  let left = str.trimStart();

  let lastLength = left.length;

  while (left.length > 0) {
    // syntax elements
    let matchedWithSyntax = false;
    for (const syntax of SyntaxTokens) {
      if (left.startsWith(syntax)) {
        const start = 0;
        const end = 0;

        tokens.push({ start, end, value: syntax });
        left = left.substring(syntax.length).trimStart();
        matchedWithSyntax = true;
        break;
      }
    }

    if (matchedWithSyntax) {
      continue;
    }

    // string literals
    if (left.startsWith(`"`)) {
      const end = left.indexOf(`"`, 1);
      const literal = left.substring(1, end);
      tokens.push({ literal });
      left = left.substring(end + 1).trimStart();
    } else if (left.startsWith(`'`)) {
      const end = left.indexOf(`'`, 1);
      const literal = left.substring(1, end);
      tokens.push({ literal });
      left = left.substring(end + 1).trimStart();
    } else {
      const identifier = /\w+/.exec(left)?.[0] ?? '';

      if (identifier.length === 0) {
        break;
      }

      tokens.push({ id: identifier });
      left = left.substring(identifier.length).trimStart();
    }

    if (left.length === lastLength) {
      // No progress, break it off
      break;
    }
    lastLength = left.length;
  }

  return tokens;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function splitBy<TElem, TSep>(
  separator: TSep,
): (array: (TElem | TSep)[]) => TElem[][] {
  return (array: (TElem | TSep)[]) => {
    const groups: TElem[][] = [];

    array.forEach((x) => {
      if (groups.length === 0) {
        if (x === separator) {
          // Do nothing
        } else {
          groups.push([x as TElem]);
        }
      } else {
        if (x === separator) {
          groups.push([]);
        } else {
          groups[groups.length - 1].push(x as TElem);
        }
      }
    });

    return groups;
  };
}

export const parseImportStatement = (tokens: ImportStatementToken[]) => {
  const allAlias =
    tokens[1] === '*' && isIdentifier(tokens[3]) ? tokens[3].id : null;

  const defaultAlias: string | null = isIdentifier(tokens[1])
    ? tokens[1].id
    : null;

  const moduleNameIdx = tokens.findIndex(isLiteral);
  const moduleName: string = pipe(tokens[moduleNameIdx], (token) => {
    if (!token) {
      throw new Error(`Missing module name in import statement.`);
    }
    return (token as LiteralToken).literal;
  });

  const namedImports: Record<string, string> = pipe(
    // all tokens between { ... }
    tokens.includes('{')
      ? tokens.slice(tokens.indexOf('{') + 1, tokens.indexOf('}'))
      : [],
    // collapsing `#0 as #1` into { #0: #1 }, and if no aliasing is done, { #0: #0 }
    splitBy(',' as const),
    mapToObj((list) => {
      if (list.length === 0) {
        throw new Error(`Invalid named import`);
      }

      const named = list[0];
      if (!isIdentifier(named)) {
        throw new Error(`Expected identifier as named import.`);
      }

      // aliased
      if (list.length === 3) {
        const alias = list[2];
        if (!isIdentifier(alias)) {
          throw new Error(`Expected identifier as alias to named import.`);
        }
        return [named.id, alias.id];
      }

      return [named.id, named.id];
    }),
  );

  // Removing all used tokens.
  for (let i = 0; i < moduleNameIdx; ++i) {
    tokens.shift();
  }

  if (tokens[0] === ';') {
    tokens.shift();
  }

  return {
    allAlias,
    defaultAlias,
    namedImports,
    moduleName,
  };
};

function parseExampleCode(rawCode: string) {
  // extracting metadata from the first comment
  let metadata: ExampleMetadata = {
    title: '<Unnamed>',
  };

  try {
    const snippet = rawCode.substring(
      rawCode.indexOf('/*') + 2,
      rawCode.indexOf('*/'),
    );
    metadata = ExampleMetadata.parse(JSON.parse(snippet));
  } catch (err) {
    console.error(
      `Malformed example, expected metadata json at the beginning. Reason: ${err}`,
    );
  }

  // Turning:
  // `import Default, { one, two } from ''module` statements into
  // `const { default: Default, one, two } = await _import('module')`

  return {
    metadata,
    code: code.substring(code.indexOf('*/') + 2),
  };
}
