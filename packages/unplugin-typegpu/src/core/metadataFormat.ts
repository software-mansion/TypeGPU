import * as tinyest from 'tinyest';
import type { TranspilationResult } from 'tinyest-for-wgsl';

const { NodeTypeCatalog: NODE, FuncParameterType } = tinyest;

/**
 * Metadata format v3 (read by `normalizeMetadata` in typegpu).
 *
 * Every module that has 'use gpu' functions declares a helper once:
 * ```js
 * const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);
 * ```
 * and each function is registered with:
 * ```js
 * __tgpu_meta(fn, '[params, statements]', { "ext.prop": () => ext.prop }, "name")
 * ```
 * - The AST is a JSON string, so engines only scan it on load, and parse it on first use.
 * - Identifier params are plain strings, destructured params are `[name, alias][]`.
 * - Numeric literals are plain numbers.
 * - `name` is omitted when the function has no name.
 */
export const META_HELPER = '__tgpu_meta';

export const metaHelperDeclaration = `const ${META_HELPER} = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);\n`;

// Same as `parseNumericString` in typegpu's WGSL generator
function parseNumericString(str: string): number {
  if (/^0x[0-9a-f]+$/i.test(str)) {
    return Number.parseInt(str);
  }
  if (/^0b[01]+$/i.test(str)) {
    return Number.parseInt(str.slice(2), 2);
  }
  return Number.parseFloat(str);
}

/**
 * Replaces `[5, '0.5']` with `0.5`. Tinyest nodes are plain arrays (and records),
 * so a generic walk is enough: no other array starts with the numeric literal tag
 * followed by a string.
 */
function inlineNumbers(node: unknown): unknown {
  if (Array.isArray(node)) {
    if (node[0] === NODE.numericLiteral && typeof node[1] === 'string') {
      const value = parseNumericString(node[1]);
      // JSON can't represent non-finite numbers, so those keep their source text
      return Number.isFinite(value) ? value : node;
    }
    return node.map(inlineNumbers);
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, inlineNumbers(v)]));
  }
  return node;
}

/**
 * The `json` argument of the helper, as a plain string (not yet a JS literal)
 */
export function metadataJSON(ast: TranspilationResult): string {
  const params = ast.params.map((p) =>
    p.type === FuncParameterType.identifier
      ? p.name
      : p.props.map((prop) => [prop.name, prop.alias]),
  );
  const [, statements] = ast.body;
  return JSON.stringify([params, inlineNumbers(statements)]);
}
