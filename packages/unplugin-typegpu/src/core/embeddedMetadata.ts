import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { type MetadatableFunction } from './common.ts';

export interface EmbeddedTypegpuMetadata {
  v: number;
  name: string | undefined;
  // TODO: parse AST and externals
}

const embeddedTypegpuMetadataCache = new WeakMap<
  NodePath<MetadatableFunction>,
  EmbeddedTypegpuMetadata
>();

/**
 * Returns the node after unwrapping any parenthesized expressions.
 */
function unwrapParentheses(node: t.Node): t.Node {
  let current = node;

  while (t.isParenthesizedExpression(current)) {
    current = current.expression;
  }

  return current;
}

/**
 * Returns the property name of a member expression.
 */
function memberPropertyName(node: t.MemberExpression): string | undefined {
  if (!node.computed && t.isIdentifier(node.property)) {
    return node.property.name;
  }

  if (node.computed && t.isStringLiteral(node.property)) {
    return node.property.value;
  }

  return undefined;
}

/**
 * Returns whether the node is a global TypeGPU metadata expression (`globalThis.__TYPEGPU_META__`).
 */
function isGlobalTypegpuMetadata(node: t.Node): boolean {
  const unwrapped = unwrapParentheses(node);

  return (
    t.isMemberExpression(unwrapped) &&
    t.isIdentifier(unwrapped.object, { name: 'globalThis' }) &&
    memberPropertyName(unwrapped) === '__TYPEGPU_META__'
  );
}

/**
 * Returns whether the node is a TypeGPU metadata set call (`(globalThis.__TYPEGPU_META__ ??= new WeakMap()).set`)
 */
function isTypegpuMetadataSetCall(node: t.CallExpression): boolean {
  const callee = unwrapParentheses(node.callee);

  if (!t.isMemberExpression(callee) || memberPropertyName(callee) !== 'set') {
    return false;
  }

  const receiver = unwrapParentheses(callee.object);

  return (
    t.isAssignmentExpression(receiver, { operator: '??=' }) &&
    isGlobalTypegpuMetadata(receiver.left)
  );
}

/**
 * Returns the node of the property with the given name in the object, if it exists.
 */
function objectPropertyValue(object: t.ObjectExpression, expectedName: string): t.Node | undefined {
  for (const property of object.properties) {
    if (!t.isObjectProperty(property) || property.computed) {
      continue;
    }

    const name = t.isIdentifier(property.key)
      ? property.key.name
      : t.isStringLiteral(property.key)
        ? property.key.value
        : undefined;

    if (name === expectedName) {
      return property.value;
    }
  }

  return undefined;
}

/**
 * Returns metadata embedded by unplugin-typegpu for this exact function.
 * Externals are required as part of the emitted shape, but are intentionally not evaluated.
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
 */
export function getEmbeddedTypegpuMetadata(
  path: NodePath<MetadatableFunction>,
): EmbeddedTypegpuMetadata | undefined {
  const cached = embeddedTypegpuMetadataCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  // we start with () => { 'use gpu'; ... }
  let expressionPath: NodePath = path;

  // rollup puts it in parentheses
  while (expressionPath.parentPath?.isParenthesizedExpression()) {
    expressionPath = expressionPath.parentPath;
  }

  // we check for f.$ = () => { 'use gpu'; ... }
  const assignmentPath = expressionPath.parentPath;
  if (!assignmentPath?.isAssignmentExpression({ operator: '=' })) {
    return undefined;
  }

  // get rid of parentheses
  let assignedPath: NodePath = assignmentPath;
  while (assignedPath.parentPath?.isParenthesizedExpression()) {
    assignedPath = assignedPath.parentPath;
  }

  // we check for `(globalThis.__TYPEGPU_META__ ??= new WeakMap()).set()`
  const callPath = assignedPath.parentPath;
  if (!(callPath?.isCallExpression() && isTypegpuMetadataSetCall(callPath.node))) {
    return undefined;
  }

  // we check for the metadata object
  const metadataNode = callPath.node.arguments[1];
  if (!t.isObjectExpression(metadataNode)) {
    return undefined;
  }

  // get the metadata properties
  const versionNode = objectPropertyValue(metadataNode, 'v');
  const nameNode = objectPropertyValue(metadataNode, 'name');
  const astNode = objectPropertyValue(metadataNode, 'ast');
  const externalsNode = objectPropertyValue(metadataNode, 'externals');

  if (
    !t.isNumericLiteral(versionNode) ||
    nameNode === undefined ||
    astNode === undefined ||
    externalsNode === undefined
  ) {
    return undefined;
  }

  const name = t.isStringLiteral(nameNode) ? nameNode.value : undefined;

  const embeddedTypegpuMetadata = {
    v: versionNode.value,
    name,
  };
  embeddedTypegpuMetadataCache.set(path, embeddedTypegpuMetadata);

  return embeddedTypegpuMetadata;
}
