import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { TranspilationResult } from 'tinyest-for-wgsl';
import type { MetadatableFunction } from './common.ts';
import { META_HELPER, parseMetadataJSON } from './metadataFormat.ts';

const METADATA_PARSING_ERROR_MESSAGE =
  '[unplugin-typegpu] Error when parsing metadata: required fields are missing or could not be evaluated.';

type FunctionAst = Pick<TranspilationResult, 'params' | 'body'>;
type FunctionExternals = Map<string, NodePath<t.ObjectProperty>>;

export type EmbeddedTypegpuMetadata = {
  v: number;
  name: string | undefined;
  function?: {
    ast: FunctionAst;
    /** v2: the AST object literal, v3: the JSON string literal */
    astPath: NodePath<t.Expression>;
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
 * Walks down from the given path through parentheses and type-only wrappers,
 * returning the innermost wrapped expression.
 */
function skipTransparentWrappersDown(path: NodePath): NodePath {
  let current = path;

  while (isTransparentWrapper(current.node)) {
    current = current.get('expression') as NodePath;
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

    if (name === undefined) {
      return undefined;
    }

    externals.set(name, propertyPath);
  }

  return externals;
}

/**
 * Returns the value of a string literal, or of a template literal without expressions
 * (minifiers like to turn strings into those).
 */
function staticStringValue(node: t.Node | undefined): string | undefined {
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/**
 * Returns the function a call goes to: either a function expression, or what the callee
 * identifier is bound to (if it's a function).
 */
function calledFunction(callPath: NodePath<t.CallExpression>): t.Function | undefined {
  const callee = unwrapExpression(callPath.node.callee);
  if (t.isFunction(callee)) {
    return callee;
  }
  if (!t.isIdentifier(callee)) {
    return undefined;
  }
  const declaration = callPath.scope.getBinding(callee.name)?.path.node;
  const fn = t.isVariableDeclarator(declaration) ? declaration.init : declaration;
  return t.isFunction(fn) ? fn : undefined;
}

/**
 * Returns whether the call is to the v3 metadata helper. Minifiers rename the helper, or
 * inline it when a module only uses it once, so we look at the function being called:
 * one that touches `__TYPEGPU_META__`.
 */
function isMetaHelperCall(callPath: NodePath<t.CallExpression>): boolean {
  const helper = calledFunction(callPath);
  if (!helper) {
    const callee = callPath.node.callee;
    // The helper is declared in the same module, but we might not see its binding
    return t.isIdentifier(callee) && callee.name === META_HELPER;
  }

  let found = false;
  t.traverseFast(helper, (child) => {
    found ||= isTypegpuMetadataAccess(child);
  });
  return found;
}

/**
 * v3: `__tgpu_meta(() => { 'use gpu'; ... }, '[params, statements]', { ...externals }, 'name')`
 */
function getEmbeddedMetadataV3(fnPath: NodePath): EmbeddedTypegpuMetadata | undefined {
  const callPath = fnPath.parentPath;
  if (!callPath?.isCallExpression() || callPath.node.arguments[0] !== fnPath.node) {
    return undefined;
  }

  const [, json, externals, name] = callPath.node.arguments;
  const jsonValue = staticStringValue(json);
  if (jsonValue === undefined || !t.isObjectExpression(externals) || !isMetaHelperCall(callPath)) {
    return undefined;
  }

  const astPath = callPath.get('arguments.1') as NodePath<t.Expression>;
  const externalsPath = callPath.get('arguments.2') as NodePath<t.ObjectExpression>;

  let ast: FunctionAst;
  try {
    ast = parseMetadataJSON(jsonValue);
  } catch {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }
  const parsedExternals = parseExternalsPath(externalsPath);
  if (parsedExternals === undefined) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  return {
    v: 3,
    name: staticStringValue(name),
    function: { ast, astPath, externals: parsedExternals },
  };
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
 * Both the current format (v3, see `metadataFormat.ts`) and the previous ones (v1, v2) are
 * recognized, so that code transformed by older versions isn't transformed again.
 *
 * @note v2 and v3 metadata is parsed in full. For v1, only the version and name are parsed.
 */
export function getEmbeddedTypegpuMetadata(
  path: NodePath<MetadatableFunction>,
): EmbeddedTypegpuMetadata | undefined {
  const cached = embeddedTypegpuMetadataCache.get(path);
  if (cached !== undefined) {
    return cached;
  }

  // we start with () => { 'use gpu'; ... }
  const fnPath = skipTransparentWrappersUp(path);

  const v3 = getEmbeddedMetadataV3(fnPath);
  if (v3) {
    embeddedTypegpuMetadataCache.set(path, v3);
    return v3;
  }

  // v1/v2: we check for $.f = () => { 'use gpu'; ... }
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
  const metadataPath = callPath.get('arguments.1');
  if (metadataPath === undefined) {
    return undefined;
  }

  const unwrappedMetadataPath = skipTransparentWrappersDown(metadataPath as NodePath);
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

  const version = versionResult.value;
  const name = nameResult.value;

  if (typeof version !== 'number' || (typeof name !== 'string' && name !== undefined)) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  if (version !== 2) {
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
