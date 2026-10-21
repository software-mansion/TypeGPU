import * as tinyest from 'tinyest';
import { getFunctionMetadata } from './meta.ts';
import { stringifyNode } from './tseynit.ts';

const { NodeTypeCatalog: NODE } = tinyest;

const overloads: Record<string, string> = {
  '+': '__tsover_add',
  '-': '__tsover_sub',
  '*': '__tsover_mul',
  '/': '__tsover_div',
  '%': '__tsover_mod',
};

/**
 * Rewrites arithmetic into `__tsover_*` calls, like unplugin-typegpu does to JS implementations.
 * Tinyest nodes are plain arrays (and records), so a generic walk is enough.
 */
function overloadOperators(node: unknown): unknown {
  if (!Array.isArray(node)) {
    // Object expressions hold their properties in a record
    return node && typeof node === 'object'
      ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, overloadOperators(v)]))
      : node;
  }
  const n = node.map(overloadOperators);
  const [type, lhs, op, rhs] = n as [unknown, unknown, string, unknown];
  if (type === NODE.binaryExpr && overloads[op]) {
    return [NODE.call, overloads[op], [lhs, rhs]];
  }
  if (type === NODE.assignmentExpr && overloads[op.slice(0, -1)]) {
    return [NODE.assignmentExpr, lhs, '=', [NODE.call, overloads[op.slice(0, -1)], [lhs, rhs]]];
  }
  return n;
}

/**
 * EXPERIMENT (`unstable_stripJsImpl` in unplugin-typegpu).
 * Recreates the JS implementation of a function whose body was stripped at build time,
 * from its AST. Externals are read once, when this is called.
 */
export function reviveFunction(fn: object): (...args: unknown[]) => unknown {
  const meta = getFunctionMetadata(fn);
  if (!meta) {
    throw new Error('Cannot recreate a function without metadata');
  }
  const externals = meta.externals();
  // Externals can be property paths ("std.mix"), so we rebuild the root objects
  const scope: Record<string, unknown> = {};
  for (const key of Object.keys(externals)) {
    const path = key.split('.');
    let target = scope;
    for (const segment of path.slice(0, -1)) {
      target = (target[segment] ??= {}) as Record<string, unknown>;
    }
    target[path.at(-1) as string] = externals[key];
  }
  const params = meta.ast.params.map((p) =>
    p.type === 'i' ? p.name : `{${p.props.map((prop) => `${prop.name}:${prop.alias}`).join(',')}}`,
  );
  const body = stringifyNode(overloadOperators(meta.ast.body) as tinyest.Block);
  // oxlint-disable-next-line typescript/no-implied-eval -- recreating the function is the point
  return new Function(...Object.keys(scope), `return (${params.join(',')}) => ${body}`)(
    ...Object.values(scope),
  );
}
