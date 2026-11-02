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
 * Returns the node after unwrapping any parenthesized expressions and type-only wrappers.
 */
function unwrapExpression(node: t.Node): t.Node {
  let current = node;

  while (isTransparentWrapper(current)) {
    current = current.expression;
  }

  return current;
}

/**
 * Wrappers that don't change the runtime value of the wrapped expression.
 */
function isTransparentWrapper(
  node: t.Node,
): node is
  | t.ParenthesizedExpression
  | t.TSAsExpression
  | t.TSSatisfiesExpression
  | t.TSNonNullExpression
  | t.TSTypeAssertion
  | t.TypeCastExpression {
  return (
    t.isParenthesizedExpression(node) ||
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSNonNullExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isTypeCastExpression(node)
  );
}

/**
 * Returns the property name of a member expression.
 */
function memberPropertyName(
  node: t.MemberExpression | t.OptionalMemberExpression,
): string | undefined {
  if (!node.computed && t.isIdentifier(node.property)) {
    return node.property.name;
  }

  if (node.computed && t.isStringLiteral(node.property)) {
    return node.property.value;
  }

  return undefined;
}

/**
 * Returns whether the node is an access to the global TypeGPU metadata map
 * (`globalThis.__TYPEGPU_META__`, `globalThis["__TYPEGPU_META__"]`, `self.__TYPEGPU_META__`, ...).
 */
function isTypegpuMetadataAccess(node: t.Node): boolean {
  return (
    (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
    memberPropertyName(node) === '__TYPEGPU_META__'
  );
}

/**
 * Returns whether the node is a TypeGPU metadata set call.
 *
 * We emit `(globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(...)`, but other tools
 * can rewrite the receiver when downleveling or minifying, e.g.:
 * - `(globalThis.__TYPEGPU_META__ ?? (globalThis.__TYPEGPU_META__ = new WeakMap)).set(...)`
 * - `((_a = globalThis.__TYPEGPU_META__) != null ? _a : globalThis.__TYPEGPU_META__ = new WeakMap()).set(...)`
 *
 * To be resilient to these, we accept any `.set` call whose receiver references `__TYPEGPU_META__`.
 */
function isTypegpuMetadataSetCall(node: t.CallExpression | t.OptionalCallExpression): boolean {
  const callee = unwrapExpression(node.callee);

  if (
    !(t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) ||
    memberPropertyName(callee) !== 'set'
  ) {
    return false;
  }

  let found = false;
  t.traverseFast(callee.object, (child) => {
    found ||= isTypegpuMetadataAccess(child);
  });
  return found;
}

/**
 * Walks up from the given path through parentheses and type-only wrappers
 * (bundlers like rollup put things in parentheses), returning the outermost wrapper.
 */
function skipTransparentWrappersUp(path: NodePath): NodePath {
  let current = path;

  while (current.parentPath && isTransparentWrapper(current.parentPath.node)) {
    current = current.parentPath;
  }

  return current;
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
  // we check for $.f = () => { 'use gpu'; ... }
  const fnPath = skipTransparentWrappersUp(path);
  const assignmentPath = fnPath.parentPath;
  if (
    !assignmentPath?.isAssignmentExpression({ operator: '=' }) ||
    assignmentPath.node.right !== fnPath.node
  ) {
    return undefined;
  }

  // we check for `<...__TYPEGPU_META__...>.set($.f = () => { ... }, { ... })`
  const assignedPath = skipTransparentWrappersUp(assignmentPath);
  const callPath = assignedPath.parentPath;
  if (
    !(callPath?.isCallExpression() || callPath?.isOptionalCallExpression()) ||
    callPath.node.arguments[0] !== assignedPath.node ||
    !isTypegpuMetadataSetCall(callPath.node)
  ) {
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
