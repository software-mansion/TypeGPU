import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import { NodeTypeCatalog, type BindingPattern } from 'tinyest';

export function parseBindingPattern(node: babel.LVal | acorn.Pattern): BindingPattern {
  if (node.type === 'Identifier') {
    return node.name;
  }

  if (node.type !== 'ObjectPattern') {
    throw new Error(`Unsupported binding pattern: ${node.type}`);
  }

  return [
    NodeTypeCatalog.objectPattern,
    node.properties.map((prop): [name: string, alias: string] => {
      if (
        (prop.type !== 'Property' && prop.type !== 'ObjectProperty') ||
        prop.computed ||
        prop.key.type !== 'Identifier' ||
        prop.value.type !== 'Identifier'
      ) {
        throw new Error('Only simple object destructuring is currently supported.');
      }

      return [prop.key.name, prop.value.name];
    }),
  ];
}
