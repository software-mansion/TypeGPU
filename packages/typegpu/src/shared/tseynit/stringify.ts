import * as tinyest from 'tinyest';

const { NodeTypeCatalog: NODE } = tinyest;

const STATEMENT_ONLY_TYPES: number[] = [
  NODE.block,
  NODE.return,
  NODE.if,
  NODE.let,
  NODE.const,
  NODE.for,
  NODE.while,
  NODE.continue,
  NODE.break,
  NODE.forOf,
];

function assertExhaustive(value: never): never {
  throw new Error(`'${JSON.stringify(value)}' was not handled by the WGSL generator.`);
}

function isExpression(node: tinyest.AnyNode): node is tinyest.Expression {
  if (typeof node === 'string' || typeof node === 'boolean') {
    return true;
  }
  return !STATEMENT_ONLY_TYPES.includes(node[0]);
}

export function stringifyStatement(node: tinyest.Statement, ident = ''): string {
  if (isExpression(node)) {
    const statement = stringifyExpression(node, ident);
    return `${ident}${statement};`;
  }

  if (node[0] === NODE.block) {
    const statements = node[1].map((node) => stringifyStatement(node, ident + '  '));
    return `{\n${statements.join('\n')}\n${ident}}`;
  }

  // @ts-ignore
  assertExhaustive(node);
}

export function stringifyExpression(node: tinyest.Expression, ident = ''): string {
  if (typeof node === 'string') {
    return node;
  }

  if (typeof node === 'boolean') {
    return `${node}`;
  }

  if (node[0] === NODE.numericLiteral) {
    return `${node[1]}`;
  }

  if (node[0] === NODE.stringLiteral) {
    // TODO: handle ', ", `, escapes, etc.
    return `'${node[1]}'`;
  }

  if (node[0] === NODE.arrayExpr) {
    const elements = node[1].map((node) => stringifyExpression(node, ident));
    return `[${elements.join(', ')}]`;
  }

  // @ts-ignore
  assertExhaustive(node);
}
