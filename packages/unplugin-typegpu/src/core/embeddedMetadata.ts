import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { TranspilationResult } from 'tinyest-for-wgsl';
import { METADATA_FORMAT_VERSION } from './version.ts';
import type { MetadatableFunction } from './common.ts';

const METADATA_PARSING_ERROR_MESSAGE =
  '[unplugin-typegpu] Error when parsing metadata: required fields are missing or could not be evaluated.';

type FunctionAst = Pick<TranspilationResult, 'params' | 'body'>;
type FunctionExternals = Map<string, NodePath<t.ObjectProperty>>;

export type EmbeddedTypegpuMetadata = {
  v: number;
  name: string | undefined;
  function?: {
    ast: FunctionAst;
    astPath: NodePath<t.ObjectExpression>;
    externals: FunctionExternals;
  };
};

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
 * Returns the value path of the first matching property. If there is no match, returns `undefined`.
 */
function objectPropertyPath(
  objectPath: NodePath<t.ObjectExpression>,
  name: string,
): NodePath<t.Expression> | undefined {
  for (const property of objectPath.get('properties')) {
    if (!property.isObjectProperty()) {
      continue;
    }

    const { key, computed } = property.node;

    const matches =
      (!computed && t.isIdentifier(key, { name })) || t.isStringLiteral(key, { value: name });

    if (!matches) {
      continue;
    }

    const value = property.get('value');
    if (value.isExpression()) {
      return value;
    }
  }

  return undefined;
}
/**
 * Returns the parsed AST
 */
function parseAstPath(astPath: NodePath<t.ObjectExpression>): FunctionAst | undefined {
  const evaluated = astPath.evaluate();

  return !evaluated.confident ? undefined : (evaluated.value as FunctionAst);
}

/**
 * Externals are represented as an object with string keys and external getters.
 * This function parses such objects and returns a map keyed by string, with values that point to the corresponding object property node paths.
 */
function parseExternalsPath(
  externalsPath: NodePath<t.ObjectExpression>,
): FunctionExternals | undefined {
  const externals: FunctionExternals = new Map();

  for (const propertyPath of externalsPath.get('properties')) {
    if (!propertyPath.isObjectProperty()) {
      return undefined;
    }

    const { computed, key } = propertyPath.node;

    const name = t.isStringLiteral(key)
      ? key.value
      : !computed && t.isIdentifier(key)
        ? key.name
        : undefined;

    if (name === undefined || !propertyPath.get('value').isArrowFunctionExpression()) {
      return undefined;
    }

    externals.set(name, propertyPath);
  }

  return externals;
}

/**
 * Returns metadata embedded by unplugin-typegpu for this exact function.
 *
 * The returned object contains:
 * - `v`: the metadata version
 * - `name`: the function name, which may be undefined
 * - `function`: an object containing the parsed AST, its source node path, and a map
 *   from external names to their original property paths
 *
 * @note Metadata v1 support is limited. Only the version and name are parsed.
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
  const metadataPath = callPath.get('arguments.1') as NodePath;
  if (metadataPath === undefined) {
    return undefined;
  }

  const unwrappedMetadataPath = skipTransparentWrappersUp(metadataPath);
  if (!unwrappedMetadataPath.isObjectExpression()) {
    return undefined;
  }

  // get the metadata properties
  const versionPath = objectPropertyPath(unwrappedMetadataPath, 'v');
  const namePath = objectPropertyPath(unwrappedMetadataPath, 'name');

  if (versionPath === undefined || namePath === undefined) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  const versionResult = versionPath.evaluate();
  const nameResult = namePath.evaluate();

  if (!versionResult.confident || !nameResult.confident) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  const version = versionResult.value as number;
  const name = nameResult.value as string | undefined;

  if (version !== METADATA_FORMAT_VERSION) {
    const embeddedTypegpuMetadata = {
      v: version,
      name,
    };
    embeddedTypegpuMetadataCache.set(path, embeddedTypegpuMetadata);
    return embeddedTypegpuMetadata;
  }

  const astPath = objectPropertyPath(unwrappedMetadataPath, 'ast');
  const externalsPath = objectPropertyPath(unwrappedMetadataPath, 'externals');

  if (astPath === undefined || externalsPath === undefined) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  if (!astPath.isObjectExpression() || !externalsPath.isObjectExpression()) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  const ast = parseAstPath(astPath);
  const externals = parseExternalsPath(externalsPath);

  if (ast === undefined || externals === undefined) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  const embeddedTypegpuMetadata = {
    v: version,
    name,
    function: {
      ast,
      astPath,
      externals,
    },
  };
  embeddedTypegpuMetadataCache.set(path, embeddedTypegpuMetadata);

  return embeddedTypegpuMetadata;
}
