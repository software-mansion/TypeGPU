import type { transpileFn } from 'tinyest-for-wgsl';
import * as tinyest from 'tinyest';
const { NodeTypeCatalog: NODE } = tinyest;

/**
 * Generates all strings consisting of lowercase letters of the given length.
 */
function* fixedLengthNameGenerator(length: number): Generator<string> {
  if (length === 0) {
    yield '';
    return;
  }

  for (let i = 97 /* ASCII a */; i <= 122 /* ASCII z */; i++) {
    for (const name of fixedLengthNameGenerator(length - 1)) {
      yield `${String.fromCharCode(i)}${name}`;
    }
  }
}

/**
 * Generates all strings consisting of lowercase letters.
 */
function* nameGenerator(): Generator<string> {
  for (let i = 1; ; i++) {
    for (const name of fixedLengthNameGenerator(i)) {
      yield name;
    }
  }
}

class Obfuscator {
  #nameMap: Map<string, string> = new Map();
  #nameGenerator: Generator<string> = nameGenerator();

  #generateFreshName(): string {
    return this.#nameGenerator.next().value;
  }

  /**
   * If `name` wasn't obfuscated before, give it a new obfuscated name.
   * Then, returns the obfuscated version of `name`.
   */
  obfuscate(name: string): string {
    let obfuscatedName = this.#nameMap.get(name);
    if (!obfuscatedName) {
      obfuscatedName = this.#generateFreshName();
      this.#nameMap.set(name, obfuscatedName);
    }

    return obfuscatedName;
  }
}

class Context {
  obfuscator: Obfuscator;

  constructor() {
    this.obfuscator = new Obfuscator();
  }
}

export function obfuscate(fn: ReturnType<typeof transpileFn>): ReturnType<typeof transpileFn> {
  const ctx = new Context();

  const params = fn.params.map((param) => {
    if (param.type === 'i') {
      return { ...param, name: ctx.obfuscator.obfuscate(param.name) };
    }
    // We cannot obfuscate destructured names, because WGSL generation relies on these names (e.g. `$instanceIndex`).
    return {
      ...param,
      props: param.props.map((prop) => ({ ...prop, alias: ctx.obfuscator.obfuscate(prop.alias) })),
    };
  });

  const body = obf(ctx, fn.body);

  const externalNames = new Map();
  fn.externalNames.forEach((value, key) => externalNames.set(ctx.obfuscator.obfuscate(key), value));

  return { params, body, externalNames };
}

// Nodes like 'continue' and 'break' are still listed
// instead of just falling back to node copy when a node is missing,
// so that types will warn us when a new node is added.
const visitors = {
  block(ctx: Context, node: tinyest.Block) {
    return [NODE.block, node[1].map((node) => obf(ctx, node))];
  },
  binaryExpr(ctx: Context, node: tinyest.BinaryExpression) {
    return [NODE.binaryExpr, obf(ctx, node[1]), node[2], obf(ctx, node[3])];
  },
  assignmentExpr(ctx: Context, node: tinyest.AssignmentExpression) {
    return [NODE.assignmentExpr, obf(ctx, node[1]), node[2], obf(ctx, node[3])];
  },
  logicalExpr(ctx: Context, node: tinyest.LogicalExpression) {
    return [NODE.logicalExpr, obf(ctx, node[1]), node[2], obf(ctx, node[3])];
  },
  unaryExpr(ctx: Context, node: tinyest.UnaryExpression) {
    return [NODE.unaryExpr, node[1], obf(ctx, node[2])];
  },
  numericLiteral(_ctx: Context, node: tinyest.Num) {
    return [NODE.numericLiteral, node[1]];
  },
  call(ctx: Context, node: tinyest.Call) {
    return [NODE.call, obf(ctx, node[1]), node[2].map((node) => obf(ctx, node))];
  },
  memberAccess(ctx: Context, node: tinyest.MemberAccess) {
    return [NODE.memberAccess, obf(ctx, node[1]), /* intentionally omitted */ node[2]];
  },
  indexAccess(ctx: Context, node: tinyest.IndexAccess) {
    return [NODE.indexAccess, obf(ctx, node[1]), obf(ctx, node[2])];
  },
  return(ctx: Context, node: tinyest.Return) {
    return node.length === 1 ? [NODE.return] : [NODE.return, obf(ctx, node[1])];
  },
  if(ctx: Context, node: tinyest.If) {
    return node.length === 3
      ? [NODE.if, obf(ctx, node[1]), obf(ctx, node[2])]
      : [NODE.if, obf(ctx, node[1]), obf(ctx, node[2]), obf(ctx, node[3])];
  },
  let(ctx: Context, node: tinyest.Let) {
    return node.length === 2
      ? [NODE.let, obf(ctx, node[1])]
      : [NODE.let, obf(ctx, node[1]), obf(ctx, node[2])];
  },
  const(ctx: Context, node: tinyest.Const) {
    return node.length === 2
      ? [NODE.const, obf(ctx, node[1])]
      : [NODE.const, obf(ctx, node[1]), obf(ctx, node[2])];
  },
  for(ctx: Context, node: tinyest.For) {
    return [NODE.for, obf(ctx, node[1]), obf(ctx, node[2]), obf(ctx, node[3]), obf(ctx, node[4])];
  },
  while(ctx: Context, node: tinyest.While) {
    return [NODE.while, obf(ctx, node[1]), obf(ctx, node[2])];
  },
  continue(_ctx: Context, _node: tinyest.Continue) {
    return [NODE.continue];
  },
  break(_ctx: Context, _node: tinyest.Break) {
    return [NODE.break];
  },
  forOf(ctx: Context, node: tinyest.ForOf) {
    return [NODE.forOf, obf(ctx, node[1]), obf(ctx, node[2]), obf(ctx, node[3])];
  },
  arrayExpr(ctx: Context, node: tinyest.ArrayExpression) {
    return [NODE.arrayExpr, node[1].map((node) => obf(ctx, node))];
  },
  preUpdate(ctx: Context, node: tinyest.PreUpdate) {
    return [NODE.preUpdate, node[1], obf(ctx, node[2])];
  },
  postUpdate(ctx: Context, node: tinyest.PostUpdate) {
    return [NODE.postUpdate, node[1], obf(ctx, node[2])];
  },
  stringLiteral(_ctx: Context, node: tinyest.Str) {
    return [NODE.stringLiteral, node[1]];
  },
  objectExpr(ctx: Context, node: tinyest.ObjectExpression) {
    return [
      NODE.objectExpr,
      Object.fromEntries(
        Object.entries(node[1]).map(([key, value]) => [
          /* intentionally omitted */ key,
          obf(ctx, value),
        ]),
      ),
    ];
  },
  conditionalExpr(ctx: Context, node: tinyest.ConditionalExpression) {
    return [NODE.conditionalExpr, obf(ctx, node[1]), obf(ctx, node[2]), obf(ctx, node[3])];
  },
  nullLiteral(_: Context, node: tinyest.Null) {
    return node;
  },
  booleanLiteral(_: Context, node: tinyest.Bool) {
    if (typeof node === 'boolean') {
      return node;
    }
    return [NODE.booleanLiteral, node[1]];
  },
  identifier(ctx: Context, node: tinyest.Identifier) {
    if (typeof node === 'string') {
      return obf(ctx, node);
    }
    return [NODE.identifier, obf(ctx, node[1])];
  },
} as const satisfies {
  [N in keyof typeof NODE]: (
    ctx: Context,
    node: Extract<tinyest.AnyNode, [type: (typeof NODE)[N]]>,
  ) => tinyest.AnyNode;
};

const nodeIdToName = new Map(Object.entries(NODE).map(([key, value]) => [value, key])) as Map<
  number,
  keyof typeof NODE
>;

/**
 * Traverses the AST and generates a new one that is obfuscated.
 * Copies old AST when identifiers cannot appear in a subtree,
 * e.g. in a member access property, or for operator nodes ('=', '<', ...).
 */
function obf<T extends tinyest.AnyNode | null>(ctx: Context, node: T): T {
  if (node === null) {
    return node;
  }

  if (typeof node === 'string') {
    // If we got here, then this identifier should be obfuscated.
    return ctx.obfuscator.obfuscate(node) as T;
  }

  if (typeof node === 'boolean') {
    return node;
  }

  const nodeName: keyof typeof visitors | undefined = nodeIdToName.get(node[0]);
  if (nodeName === undefined) {
    throw new Error(`Internal error, no name for node type ${node[0]}.`);
  }
  const visitor = visitors[nodeName] as unknown as ((ctx: Context, node: T) => T) | undefined;
  if (!visitor) {
    throw new Error(`Internal error, no visitor for node '${nodeName}'.`);
  }
  return visitor(ctx, node);
}
