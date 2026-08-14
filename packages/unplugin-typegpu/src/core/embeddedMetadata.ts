import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { type MetadatableFunction } from './common.ts';
import type { Block, FuncParameter } from 'tinyest';

export interface EmbeddedTypegpuMetadata {
  v: number;
  name: string | undefined;
  ast?: { params: FuncParameter[]; body: Block };
  // TODO: parse AST and externals
}

const embeddedTypegpuMetadataCache = new WeakMap<
  NodePath<MetadatableFunction>,
  EmbeddedTypegpuMetadata
>();

/**
 * Returns the node after unwrapping any parenthesized expressions.
 *
 * Example: `(a + b)` returns `a + b`.
 */
function unwrapParentheses(node: t.Expression): t.Expression;
function unwrapParentheses(node: t.Node): t.Node;
function unwrapParentheses(node: t.Node): t.Node {
  let current = node;

  while (t.isParenthesizedExpression(current)) {
    current = current.expression;
  }

  return current;
}

/**
 * Returns the first parent path that is not a parenthesized expression.
 */
function parentPathSkippingParentheses(path: NodePath): NodePath | null {
  let parentPath = path.parentPath;

  while (parentPath?.isParenthesizedExpression()) {
    parentPath = parentPath.parentPath;
  }

  return parentPath;
}

/**
 * Returns the property name of a member expression.
 */
function memberPropertyName(node: t.MemberExpression): string | undefined {
  const property = unwrapParentheses(node.property); // foo[('bar')]

  if (!node.computed && t.isIdentifier(property)) {
    return property.name;
  }

  if (node.computed && t.isStringLiteral(property)) {
    return property.value;
  }

  return undefined;
}

/**
 * Returns whether the node is a global TypeGPU metadata expression `globalThis.__TYPEGPU_META__`.
 */
function isGlobalTypegpuMetadata(node: t.Node): boolean {
  const expression = unwrapParentheses(node);

  return (
    t.isMemberExpression(expression) &&
    t.isIdentifier(unwrapParentheses(expression.object), { name: 'globalThis' }) &&
    memberPropertyName(expression) === '__TYPEGPU_META__'
  );
}

/**
 * Returns whether the node is a TypeGPU metadata set call `(globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(...)`.
 */
function isTypegpuMetadataSetCall(node: t.CallExpression): boolean {
  const callee = unwrapParentheses(node.callee);

  if (!(t.isMemberExpression(callee) && memberPropertyName(callee) === 'set')) {
    return false;
  }

  const receiver = unwrapParentheses(callee.object);

  return (
    t.isAssignmentExpression(receiver, { operator: '??=' }) &&
    isGlobalTypegpuMetadata(receiver.left)
  );
}

/**
 * Returns the value node of the property with the given name in the object, if it exists.
 */
function objectPropertyValue(
  object: t.ObjectExpression,
  expectedName: string,
): t.Expression | undefined {
  for (const property of object.properties) {
    if (!t.isObjectProperty(property)) {
      continue;
    }

    const key = unwrapParentheses(property.key); // { foo: (2) }
    const name =
      !property.computed && t.isIdentifier(key)
        ? key.name
        : t.isStringLiteral(key)
          ? key.value
          : undefined;

    if (name === expectedName && t.isExpression(property.value)) {
      return unwrapParentheses(property.value);
    }
  }

  return undefined;
}

type EncodedTinyestValue =
  | number
  | string
  | boolean
  | null
  | EncodedTinyestValue[]
  | { [key: string]: EncodedTinyestValue };

function parseTinyestValue(node: t.Node): EncodedTinyestValue | undefined {
  if (t.isNumericLiteral(node) || t.isStringLiteral(node) || t.isBooleanLiteral(node)) {
    return node.value;
  }

  if (t.isNullLiteral(node)) {
    return null;
  }

  if (t.isArrayExpression(node)) {
    const result: EncodedTinyestValue[] = [];

    for (const element of node.elements) {
      if (element === null || !t.isExpression(element)) {
        return undefined;
      }

      const parsed = parseTinyestValue(element);
      if (parsed === undefined) {
        return undefined;
      }

      result.push(parsed);
    }

    return result;
  }

  if (t.isObjectExpression(node)) {
    const result: Record<string, EncodedTinyestValue> = {};

    for (const property of node.properties) {
      if (!t.isObjectProperty(property) || property.computed || !t.isExpression(property.value)) {
        return undefined;
      }

      const keyNode = property.key;
      const key = t.isIdentifier(keyNode)
        ? keyNode.name
        : t.isStringLiteral(keyNode) || t.isNumericLiteral(keyNode)
          ? String(keyNode.value)
          : undefined;

      if (key === undefined) {
        return undefined;
      }

      const value = parseTinyestValue(property.value);
      if (value === undefined) {
        return undefined;
      }

      result[key] = value;
    }

    return result;
  }

  return undefined;
}

/**
 * Given AST of a function's parameters, returns the parsed parameters.
 */
function parseFuncParameters(paramsNode: t.ArrayExpression): FuncParameter[] | undefined {
  return [];
}

/**
 * Given AST of a function's body in tinyest encoding, returns the parsed body in tinyest encoding.
 */
function parseBody(bodyNode: t.ArrayExpression): Block {
  const parsed = parseTinyestValue(bodyNode);

  if (
    !(
      parsed !== undefined &&
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed[0] === 0 &&
      Array.isArray(parsed[1])
    )
  ) {
    throw new Error(
      'unplugin-typegpu: While parsing metadata encountered an invalid ast.body node.',
    );
  }

  return parsed as unknown as Block;
}

function parseAstNode(astNode: t.ObjectExpression): EmbeddedTypegpuMetadata['ast'] | undefined {
  const paramsNode = objectPropertyValue(astNode, 'params');
  const bodyNode = objectPropertyValue(astNode, 'body');

  if (
    !paramsNode ||
    !bodyNode ||
    !t.isArrayExpression(paramsNode) ||
    !t.isArrayExpression(bodyNode)
  ) {
    return undefined;
  }

  const params = parseFuncParameters(paramsNode);
  const body = parseBody(bodyNode);

  if (!params) {
    return undefined;
  }

  return {
    params,
    body,
  };
}

/**
 * Returns metadata embedded by unplugin-typegpu for this exact function.
 *
 * Consider:
 * ```ts
 * const f = ($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
 *   'use gpu';
 * }, {
 *   v: 2,
 *   name: "f",
 *   ast: {
 *     params: [],
 *     body: [0, []]
 *   },
 *   externals: {}
 * }) && $.f)({});
 * ```
 *
 * Function will return:
 * {
 *   v: 2,
 *   name: "f",
 *   ast: {
 *     params: [],
 *     body: [0, []]
 *   },
 *   externals: {}
 * }
 */
export function getEmbeddedTypegpuMetadata(
  path: NodePath<MetadatableFunction>,
): EmbeddedTypegpuMetadata | undefined {
  const cached = embeddedTypegpuMetadataCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  // we check for f.$ = () => { 'use gpu'; ... }
  const assignmentPath = parentPathSkippingParentheses(path);
  if (!assignmentPath?.isAssignmentExpression({ operator: '=' })) {
    return undefined;
  }

  // we check for `(globalThis.__TYPEGPU_META__ ??= new WeakMap()).set()`
  const callPath = parentPathSkippingParentheses(assignmentPath);
  if (!(callPath?.isCallExpression() && isTypegpuMetadataSetCall(callPath.node))) {
    return undefined;
  }

  // we check for the metadata object
  const metadataArgument = callPath.node.arguments[1];
  if (metadataArgument === undefined) {
    return undefined;
  }

  const metadataNode = unwrapParentheses(metadataArgument);
  if (!t.isObjectExpression(metadataNode)) {
    return undefined;
  }

  // get the metadata properties
  const versionNode = objectPropertyValue(metadataNode, 'v');
  const nameNode = objectPropertyValue(metadataNode, 'name');

  if (!t.isNumericLiteral(versionNode) || nameNode === undefined) {
    return undefined;
  }

  const name = t.isStringLiteral(nameNode) ? nameNode.value : undefined;

  if (versionNode.value == 1) {
    return {
      v: versionNode.value,
      name,
    };
  }

  const astNode = objectPropertyValue(metadataNode, 'ast');
  const externalsNode = objectPropertyValue(metadataNode, 'externals');

  if (astNode === undefined || externalsNode === undefined) {
    return undefined;
  }

  if (!t.isObjectExpression(astNode)) {
    return undefined;
  }

  const ast = parseAstNode(astNode);
  if (ast === undefined) {
    return undefined;
  }

  const embeddedTypegpuMetadata = {
    v: versionNode.value,
    name,
    ast,
  };
  embeddedTypegpuMetadataCache.set(path, embeddedTypegpuMetadata);

  return embeddedTypegpuMetadata;
}
