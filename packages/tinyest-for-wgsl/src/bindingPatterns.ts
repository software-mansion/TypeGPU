import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import { BindingPatternType, type BindingPattern } from 'tinyest';

export function parseBindingPattern(node: babel.LVal | acorn.Pattern): BindingPattern {
  if (node.type === 'Identifier') {
    return {
      type: BindingPatternType.identifier,
      name: node.name,
    };
  }

  if (node.type !== 'ObjectPattern') {
    throw new Error(`Unsupported binding pattern: ${node.type}`);
  }

  return {
    type: BindingPatternType.destructuredObject,
    props: node.properties.map((prop) => {
      if (
        (prop.type !== 'Property' && prop.type !== 'ObjectProperty') ||
        prop.computed ||
        prop.key.type !== 'Identifier' ||
        prop.value.type !== 'Identifier'
      ) {
        throw new Error('Only simple object destructuring is currently supported.');
      }

      return {
        name: prop.key.name,
        alias: prop.value.name,
      };
    }),
  };
}
