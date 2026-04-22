import * as tinyest from 'tinyest';

const { NodeTypeCatalog: NODE } = tinyest;

// function assertExhaustive(value: never): never {
//   throw new Error(`'${value}' was not handled by the WGSL generator.`);
// }

export function stringifyExpression(node: tinyest.Expression, ident = 0): string {
  if (typeof node === 'string') {
    return node;
  }

  if (typeof node === 'boolean') {
    return `${node}`;
  }

  if (node[0] === NODE.arrayExpr) {
    const elements = node[1].map((node) => stringifyExpression(node, ident));
    return `[${elements.join(', ')}]`;
  }

  throw new Error('unhandled!!!');
  // assertExhaustive(node);
}
