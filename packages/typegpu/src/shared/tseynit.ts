import * as tinyest from 'tinyest';

const { NodeTypeCatalog: NODE } = tinyest;

export function stringifyNode(node: tinyest.AnyNode): string {
  if (isExpression(node)) {
    return stringifyExpression(node, '');
  }
  return stringifyStatement(node, '');
}

export function stringifyStatement(node: tinyest.Statement, ident = ''): string {
  if (isExpression(node)) {
    return `${ident}${stringifyExpression(node, ident)};`;
  }

  if (node[0] === NODE.block) {
    const statements = node[1].map((n) => stringifyStatement(n, ident + '  '));
    return `{\n${statements.join('\n')}\n${ident}}`;
  }

  if (node[0] === NODE.return) {
    const expr = node[1] === undefined ? '' : ` ${stringifyExpression(node[1])}`;
    return `${ident}return${expr};`;
  }

  if (node[0] === NODE.if) {
    const cond = stringifyExpression(node[1], ident);
    const then = stringifyStatement(node[2], ident);
    const base = `${ident}if (${cond}) ${then}`;
    if (node[3] !== undefined) {
      return `${base} else ${stringifyStatement(node[3], ident)}`;
    }
    return base;
  }

  if (node[0] === NODE.let) {
    if (node[2] !== undefined) {
      return `${ident}let ${node[1]} = ${stringifyExpression(node[2])};`;
    }
    return `${ident}let ${node[1]};`;
  }

  if (node[0] === NODE.const) {
    if (node[2] !== undefined) {
      return `${ident}const ${node[1]} = ${stringifyExpression(node[2])};`;
    }
    return `${ident}const ${node[1]};`;
  }

  if (node[0] === NODE.for) {
    const init = node[1] ? stringifyStatement(node[1], '') : ';';
    const cond = node[2] ? stringifyExpression(node[2]) : '';
    const update = node[3] ? stringifyStatement(node[3], '') : '';
    const body = stringifyStatement(node[4], ident);
    return `${ident}for (${init} ${cond}; ${update.slice(0, -1) /* trim the ';' */}) ${body}`;
  }

  if (node[0] === NODE.while) {
    const cond = stringifyExpression(node[1]);
    const body = stringifyStatement(node[2], ident);
    return `${ident}while (${cond}) ${body}`;
  }

  if (node[0] === NODE.continue) {
    return `${ident}continue;`;
  }

  if (node[0] === NODE.break) {
    return `${ident}break;`;
  }

  if (node[0] === NODE.forOf) {
    const leftKind = node[1][0] === NODE.const ? 'const' : 'let';
    const leftName = node[1][1];
    const right = stringifyExpression(node[2]);
    const body = stringifyStatement(node[3], ident);
    return `${ident}for (${leftKind} ${leftName} of ${right}) ${body}`;
  }

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
    return node[1];
  }

  if (node[0] === NODE.stringLiteral) {
    return JSON.stringify(node[1]);
  }

  if (node[0] === NODE.arrayExpr) {
    const elements = node[1].map((n) => stringifyExpression(n, ident));
    return `[${elements.join(', ')}]`;
  }

  if (node[0] === NODE.binaryExpr) {
    return `${wrapIfComplex(node[1], ident)} ${node[2]} ${wrapIfComplex(node[3], ident)}`;
  }

  if (node[0] === NODE.assignmentExpr) {
    return `${stringifyExpression(node[1], ident)} ${node[2]} ${stringifyExpression(node[3], ident)}`;
  }

  if (node[0] === NODE.logicalExpr) {
    return `${wrapIfComplex(node[1], ident)} ${node[2]} ${wrapIfComplex(node[3], ident)}`;
  }

  if (node[0] === NODE.unaryExpr) {
    // void, instanceof and delete require a space
    const sep = node[1].length > 1 ? ' ' : '';
    return `${node[1]}${sep}${wrapIfComplex(node[2], ident)}`;
  }

  if (node[0] === NODE.call) {
    const callee = wrapIfComplex(node[1], ident);
    const args = node[2].map((n) => stringifyExpression(n, ident)).join(', ');
    return `${callee}(${args})`;
  }

  if (node[0] === NODE.memberAccess) {
    if (Array.isArray(node[1]) && node[1][0] === NODE.numericLiteral) {
      return `(${stringifyExpression(node[1])}).${node[2]}`;
    }
    return `${wrapIfComplex(node[1], ident)}.${node[2]}`;
  }

  if (node[0] === NODE.indexAccess) {
    return `${wrapIfComplex(node[1], ident)}[${stringifyExpression(node[2], ident)}]`;
  }

  if (node[0] === NODE.preUpdate) {
    return `${node[1]}${wrapIfComplex(node[2], ident)}`;
  }

  if (node[0] === NODE.postUpdate) {
    return `${wrapIfComplex(node[2], ident)}${node[1]}`;
  }

  if (node[0] === NODE.objectExpr) {
    const entries = Object.entries(node[1]).map(
      ([key, val]) => `${key}: ${stringifyExpression(val, ident)}`,
    );
    return `{ ${entries.join(', ')} }`;
  }

  if (node[0] === NODE.conditionalExpr) {
    return `${wrapIfComplex(node[1], ident)} ? ${wrapIfComplex(node[2], ident)} : ${wrapIfComplex(node[3], ident)}`;
  }

  assertExhaustive(node);
}

function assertExhaustive(value: never): never {
  throw new Error(`'${JSON.stringify(value)}' was not handled by the stringify function.`);
}

function isExpression(node: tinyest.AnyNode): node is tinyest.Expression {
  if (
    typeof node === 'string' ||
    typeof node === 'boolean' ||
    node[0] === NODE.numericLiteral ||
    node[0] === NODE.stringLiteral ||
    node[0] === NODE.arrayExpr ||
    node[0] === NODE.binaryExpr ||
    node[0] === NODE.assignmentExpr ||
    node[0] === NODE.logicalExpr ||
    node[0] === NODE.unaryExpr ||
    node[0] === NODE.call ||
    node[0] === NODE.memberAccess ||
    node[0] === NODE.indexAccess ||
    node[0] === NODE.preUpdate ||
    node[0] === NODE.postUpdate ||
    node[0] === NODE.objectExpr ||
    node[0] === NODE.conditionalExpr
  ) {
    node satisfies tinyest.Expression;
    return true;
  }
  node satisfies Exclude<tinyest.AnyNode, tinyest.Expression>;
  return false;
}

const SIMPLE_NODES: number[] = [
  NODE.memberAccess, // highest precedence
  NODE.indexAccess, // highest precedence
  NODE.call, // highest precedence
  NODE.arrayExpr, // [] make thinks not ambiguous
  NODE.stringLiteral,
  NODE.numericLiteral,
];
/**
 * Stringifies expression, and wraps it in parentheses if they cannot be trivially omitted
 */
function wrapIfComplex(node: tinyest.Expression, ident: string): string {
  const s = stringifyExpression(node, ident);
  if (typeof node === 'string' || typeof node === 'boolean') {
    return s;
  }
  if (SIMPLE_NODES.includes(node[0])) {
    return s;
  }
  return `(${s})`;
}
