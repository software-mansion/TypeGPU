import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';

export function parseObjectPattern(
  node: babel.ObjectPattern | acorn.ObjectPattern,
  parseIdentifier: (id: babel.Identifier | acorn.Identifier) => tinyest.Identifier = (id) =>
    id.name,
): tinyest.ObjectPattern {
  return [
    tinyest.NodeTypeCatalog.objectPattern,
    node.properties.map((prop): [name: string, binding: tinyest.Pattern] => {
      if (
        (prop.type !== 'Property' && prop.type !== 'ObjectProperty') ||
        prop.computed ||
        prop.key.type !== 'Identifier' ||
        prop.value.type !== 'Identifier'
      ) {
        throw new Error('Only simple object destructuring is currently supported.');
      }

      return [prop.key.name, parseIdentifier(prop.value)];
    }),
  ];
}

export function parsePattern(node: babel.LVal | acorn.Pattern): tinyest.Pattern {
  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type !== 'ObjectPattern') {
    throw new Error(`Unsupported binding pattern: ${node.type}`);
  }

  return parseObjectPattern(node);
}

export function extractBoundNames(binding: tinyest.Pattern): string[] {
  if (tinyest.isObjectPattern(binding)) {
    return binding[1].flatMap(([, element]) => extractBoundNames(element));
  }
  return [tinyest.unwrapId(binding)];
}
