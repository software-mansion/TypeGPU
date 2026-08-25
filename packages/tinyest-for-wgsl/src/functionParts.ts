import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import { FuncParameterType } from 'tinyest';
import type { JsNode } from './types.ts';

type DestructuredProps = Extract<
  tinyest.FuncParameter,
  { type: typeof FuncParameterType.destructuredObject }
>['props'];

type FunctionParts<TBody> = {
  params: tinyest.FuncParameter[];
  body: TBody;
};

type DestructuredPropsGetter<TObjectPattern> = (pattern: TObjectPattern) => DestructuredProps;

type FunctionPartsExtractor<TRootNode, TBody> = (rootNode: TRootNode) => FunctionParts<TBody>;

function createFunctionPartsExtractor(
  getDestructuredProps: DestructuredPropsGetter<acorn.ObjectPattern>,
): FunctionPartsExtractor<acorn.AnyNode, acorn.BlockStatement | acorn.Expression>;
function createFunctionPartsExtractor(
  getDestructuredProps: DestructuredPropsGetter<babel.ObjectPattern>,
): FunctionPartsExtractor<babel.Node, babel.BlockStatement | babel.Expression>;
function createFunctionPartsExtractor(
  getDestructuredProps:
    | DestructuredPropsGetter<acorn.ObjectPattern>
    | DestructuredPropsGetter<babel.ObjectPattern>,
) {
  const extract = (rootNode: JsNode) => {
    let functionNode:
      | acorn.ArrowFunctionExpression
      | acorn.FunctionExpression
      | acorn.FunctionDeclaration
      | acorn.AnonymousFunctionDeclaration
      | babel.ArrowFunctionExpression
      | babel.FunctionExpression
      | babel.FunctionDeclaration
      | null = null;

    // Unwrapping until we get to a function
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
      throw new Error(
        `Unsupported function parameter type(s): ${[...unsupportedTypes].join(', ')}`,
      );
    }

    return {
      params: (
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
              props: (
                getDestructuredProps as DestructuredPropsGetter<
                  acorn.ObjectPattern | babel.ObjectPattern
                >
              )(param),
            }
          : {
              type: FuncParameterType.identifier,
              name: param.name,
            },
      ),
      body: functionNode.body,
    };
  };

  return extract as
    | FunctionPartsExtractor<acorn.AnyNode, acorn.BlockStatement | acorn.Expression>
    | FunctionPartsExtractor<babel.Node, babel.BlockStatement | babel.Expression>;
}

function getDestructuredPropsAcorn(node: acorn.ObjectPattern): DestructuredProps {
  return node.properties.flatMap((prop) =>
    prop.type === 'Property' && prop.key.type === 'Identifier' && prop.value.type === 'Identifier'
      ? [{ name: prop.key.name, alias: prop.value.name }]
      : [],
  );
}

function getDestructuredPropsBabel(node: babel.ObjectPattern): DestructuredProps {
  return node.properties.flatMap((prop) =>
    prop.type === 'ObjectProperty' &&
    prop.key.type === 'Identifier' &&
    prop.value.type === 'Identifier'
      ? [{ name: prop.key.name, alias: prop.value.name }]
      : [],
  );
}

export const extractFunctionPartsAcorn = createFunctionPartsExtractor(getDestructuredPropsAcorn);
export const extractFunctionPartsBabel = createFunctionPartsExtractor(getDestructuredPropsBabel);
