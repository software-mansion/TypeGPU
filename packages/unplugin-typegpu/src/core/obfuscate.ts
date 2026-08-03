import type { TranspilationResult } from '../../../tinyest-for-wgsl/src/types.ts';
import { MinifierImpl, MinifierNullImpl, type Minifier } from './minifier.ts';
import * as tinyest from 'tinyest';
const { NodeTypeCatalog: NODE } = tinyest;

class Context {
  ignoreMinificationDepth = 0;
  minifier: Minifier;

  constructor() {
    this.minifier = new MinifierNullImpl();
  }
}

export function obfuscate(fn: TranspilationResult) {
  return fn;

  const ctx = new Context();

  const params = fn.params.map((param) => {
    if (param.type === 'i') {
      return { ...param, name: ctx.minifier.minify(param.name) };
    }
    return {
      ...param,
      props: param.props.map((prop) => ({ ...prop, alias: ctx.minifier.minify(prop.alias) })),
    };
  });

  const body = runOnTinyest(ctx, fn.body);

  const externalNames = new Map();
  fn.externalNames.forEach((key, value) => externalNames.set(ctx.minifier.minify(key), value));

  return { params: params, body: body, externalNames };
}

// No default fallback for nodes like 'continue' and 'break' so that types will warn us when a new node is added.
const visitors = {
  block(ctx: Context, node: tinyest.Block) {
    return [NODE.block, node[1].map((node) => runOnTinyest(ctx, node))];
  },
  binaryExpr(ctx: Context, node: tinyest.BinaryExpression) {
    return [NODE.binaryExpr, runOnTinyest(ctx, node[1]), node[2], runOnTinyest(ctx, node[3])];
  },
  assignmentExpr(ctx: Context, node: tinyest.AssignmentExpression) {
    return [NODE.assignmentExpr, runOnTinyest(ctx, node[1]), node[2], runOnTinyest(ctx, node[3])];
  },
  logicalExpr(ctx: Context, node: tinyest.LogicalExpression) {
    return [NODE.logicalExpr, runOnTinyest(ctx, node[1]), node[2], runOnTinyest(ctx, node[3])];
  },
  unaryExpr(ctx: Context, node: tinyest.UnaryExpression) {
    return [NODE.unaryExpr, node[1], runOnTinyest(ctx, node[2])];
  },
  numericLiteral(_ctx: Context, node: tinyest.Num) {
    return [NODE.numericLiteral, node[1]];
  },
  call(ctx: Context, node: tinyest.Call) {
    return [NODE.call, runOnTinyest(ctx, node[1]), node[2].map((node) => runOnTinyest(ctx, node))];
  },
  memberAccess(ctx: Context, node: tinyest.MemberAccess) {
    return [NODE.memberAccess, runOnTinyest(ctx, node[1]), node[2]];
  },
  indexAccess(ctx: Context, node: tinyest.IndexAccess) {
    return [NODE.indexAccess, runOnTinyest(ctx, node[1]), runOnTinyest(ctx, node[2])];
  },
  return(ctx: Context, node: tinyest.Return) {
    return node.length === 1 ? [NODE.return] : [NODE.return, runOnTinyest(ctx, node[1])];
  },
  if(ctx: Context, node: tinyest.If) {
    return node.length === 3
      ? [NODE.if, runOnTinyest(ctx, node[1]), runOnTinyest(ctx, node[2])]
      : [
          NODE.if,
          runOnTinyest(ctx, node[1]),
          runOnTinyest(ctx, node[2]),
          runOnTinyest(ctx, node[3]),
        ];
  },
  let(ctx: Context, node: tinyest.Let) {
    return node.length === 2
      ? [NODE.let, node[1]]
      : [NODE.let, node[1], runOnTinyest(ctx, node[2])];
  },
  const(ctx: Context, node: tinyest.Const) {
    return node.length === 2
      ? [NODE.const, node[1]]
      : [NODE.const, node[1], runOnTinyest(ctx, node[2])];
  },
  for(ctx: Context, node: tinyest.For) {
    return [
      NODE.for,
      runOnTinyest(ctx, node[1]),
      runOnTinyest(ctx, node[2]),
      runOnTinyest(ctx, node[3]),
      runOnTinyest(ctx, node[4]),
    ];
  },
  while(ctx: Context, node: tinyest.While) {
    return [NODE.while, runOnTinyest(ctx, node[1]), runOnTinyest(ctx, node[2])];
  },
  continue(_ctx: Context, _node: tinyest.Continue) {
    return [NODE.continue];
  },
  break(_ctx: Context, _node: tinyest.Break) {
    return [NODE.break];
  },
  forOf(ctx: Context, node: tinyest.ForOf) {
    return [
      NODE.forOf,
      runOnTinyest(ctx, node[1]),
      runOnTinyest(ctx, node[2]),
      runOnTinyest(ctx, node[3]),
    ];
  },
  arrayExpr(ctx: Context, node: tinyest.ArrayExpression) {
    return [NODE.arrayExpr, node[1].map((node) => runOnTinyest(ctx, node))];
  },
  preUpdate(ctx: Context, node: tinyest.PreUpdate) {
    return [NODE.preUpdate, node[1], runOnTinyest(ctx, node[2])];
  },
  postUpdate(ctx: Context, node: tinyest.PostUpdate) {
    return [NODE.postUpdate, node[1], runOnTinyest(ctx, node[2])];
  },
  stringLiteral(_ctx: Context, node: tinyest.Str) {
    return [NODE.stringLiteral, node[1]];
  },
  objectExpr(ctx: Context, node: tinyest.ObjectExpression) {
    return [
      NODE.objectExpr,
      Object.fromEntries(
        Object.entries(node[1]).map(([key, value]) => [key, runOnTinyest(ctx, value)]),
      ),
    ];
  },
  conditionalExpr(ctx: Context, node: tinyest.ConditionalExpression) {
    return [
      NODE.conditionalExpr,
      runOnTinyest(ctx, node[1]),
      runOnTinyest(ctx, node[2]),
      runOnTinyest(ctx, node[3]),
    ];
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

function runOnTinyest<T extends tinyest.AnyNode | null>(ctx: Context, node: T): T {
  if (node === null) {
    return node;
  }

  if (typeof node === 'string') {
    return node;
  }

  if (typeof node === 'boolean') {
    return node;
  }

  const nodeName: keyof typeof visitors | undefined = nodeIdToName.get(node[0]);
  if (nodeName === undefined) {
    throw new Error('AAA');
  }
  const visitor = visitors[nodeName] as unknown as ((ctx: Context, node: T) => T) | undefined;
  if (!visitor) {
    throw new Error('BBB');
  }
  return visitor(ctx, node);
}
