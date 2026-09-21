import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import type { TranspilationResult } from 'tinyest-for-wgsl';
import type { MetadatableFunction } from './common.ts';

const METADATA_PARSING_ERROR_MESSAGE =
  'unplugin-typegpu: Error when parsing metadata: required fields are missing or could not be evaluated.';

type FunctionAst = Pick<TranspilationResult, 'params' | 'body'>;

export type EmbeddedTypegpuMetadata = {
  v: number;
  name: string | undefined;
  function?: {
    ast: FunctionAst;
    astPath: NodePath<t.ObjectExpression>;
    externals: Map<string, t.ObjectProperty>;
  };
};

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
 * Works like {@link unwrapParentheses}, but for a `NodePath`.
 */
function unwrapParenthesesPath(path: NodePath): NodePath {
  let current = path;

  while (current.isParenthesizedExpression()) {
    current = current.get('expression');
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

  const inner = unwrapParentheses(callee.object);

  return (
    t.isAssignmentExpression(inner, { operator: '??=' }) && isGlobalTypegpuMetadata(inner.left)
  );
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
 * Returns metadata embedded by unplugin-typegpu for this exact function:
 *
 * @note metadata v1 support is limited. Only the version and name are parsed.
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
 *
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
  const metadataPath = callPath.get('arguments.1');
  if (metadataPath === undefined) {
    return undefined;
  }

  const unwrappedMetadataPatah = unwrapParenthesesPath(metadataPath);
  if (!unwrappedMetadataPatah.isObjectExpression()) {
    return undefined;
  }

  // get the metadata properties
  const versionPath = objectPropertyPath(unwrappedMetadataPatah, 'v');
  const namePath = objectPropertyPath(unwrappedMetadataPatah, 'name');

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

  // metadata v1 support is limited
  if (version === 1) {
    const embeddedTypegpuMetadata = {
      v: version,
      name,
    };
    embeddedTypegpuMetadataCache.set(path, embeddedTypegpuMetadata);
    return embeddedTypegpuMetadata;
  }

  const astPath = objectPropertyPath(unwrappedMetadataPatah, 'ast');
  const externalsPath = objectPropertyPath(unwrappedMetadataPatah, 'externals');

  if (astPath === undefined || externalsPath === undefined) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  if (!astPath.isObjectExpression()) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  const ast = parseAstPath(astPath);
  if (ast === undefined) {
    throw new Error(METADATA_PARSING_ERROR_MESSAGE);
  }

  const embeddedTypegpuMetadata = {
    v: version,
    name,
    function: {
      ast,
      astPath,
      externals: new Map(),
    },
  };
  embeddedTypegpuMetadataCache.set(path, embeddedTypegpuMetadata);

  return embeddedTypegpuMetadata;
}
