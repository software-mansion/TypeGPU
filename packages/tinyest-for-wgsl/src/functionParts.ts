import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import { FuncParameterType } from 'tinyest';
import type { JsNode } from './types.ts';

type FunctionNode =
  | acorn.ArrowFunctionExpression
  | acorn.FunctionExpression
  | acorn.FunctionDeclaration
  | acorn.AnonymousFunctionDeclaration
  | babel.ArrowFunctionExpression
  | babel.FunctionExpression
  | babel.FunctionDeclaration;

/**
 * Unwraps the root node until we get to a function.
 */
function unwrapToFunction(rootNode: JsNode): FunctionNode {
  let functionNode: FunctionNode | null = null;

  let unwrappedNode = rootNode;
  while (true) {
    if (unwrappedNode.type === 'Program') {
      const statement = unwrappedNode.body.filter(
        (n) => n.type === 'ExpressionStatement' || n.type === 'FunctionDeclaration',
      )[0]; // <- assuming only one function declaration

      if (!statement) {
        break;
      }

      unwrappedNode = statement;
    } else if (unwrappedNode.type === 'ExpressionStatement') {
      unwrappedNode = unwrappedNode.expression;
    } else if (unwrappedNode.type === 'ArrowFunctionExpression') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else if (unwrappedNode.type === 'FunctionExpression') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else if (unwrappedNode.type === 'FunctionDeclaration') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else {
      // Unsupported node
      break;
    }
  }

  if (!functionNode) {
    throw new Error(
      `tgpu.fn expected a single function to be passed as implementation ${JSON.stringify(
        unwrappedNode,
      )}`,
    );
  }

  return functionNode;
}

/**
 * Rejects TypeGPU functions that cannot be represented.
 */
function validateFunction(functionNode: FunctionNode): void {
  if (functionNode.async) {
    throw new Error('tgpu.fn cannot be async');
  }

  if (functionNode.generator) {
    throw new Error('tgpu.fn cannot be a generator');
  }

  const unsupportedTypes = new Set(
    functionNode.params.flatMap((param) =>
      param.type === 'ObjectPattern' || param.type === 'Identifier' ? [] : [param.type],
    ),
  );
  if (unsupportedTypes.size > 0) {
    throw new Error(`Unsupported function parameter type(s): ${[...unsupportedTypes].join(', ')}`);
  }
}

function parseParams(functionNode: FunctionNode): tinyest.FuncParameter[] {
  return (
    functionNode.params as (
      | babel.Identifier
      | acorn.Identifier
      | babel.ObjectPattern
      | acorn.ObjectPattern
    )[]
  ).map((param) =>
    param.type === 'ObjectPattern'
      ? {
          type: FuncParameterType.destructuredObject,
          props: param.properties.flatMap((prop) =>
            (prop.type === /* acorn */ 'Property' || prop.type === /* babel */ 'ObjectProperty') &&
            prop.key.type === 'Identifier' &&
            prop.value.type === 'Identifier'
              ? [{ name: prop.key.name, alias: prop.value.name }]
              : [],
          ),
        }
      : {
          type: FuncParameterType.identifier,
          name: param.name,
        },
  );
}

export function extractFunctionParts(rootNode: JsNode): {
  params: tinyest.FuncParameter[];
  body: acorn.BlockStatement | acorn.Expression | babel.BlockStatement | babel.Expression;
} {
  const functionNode = unwrapToFunction(rootNode);

  validateFunction(functionNode);

  return {
    params: parseParams(functionNode),
    body: functionNode.body,
  };
}
