import type * as acorn from 'acorn';
import type * as babel from '@babel/types';
import * as tinyest from 'tinyest';
import type { Context, JsNode, Transpile, Transpilers } from './types.ts';

const { NodeTypeCatalog: NODE } = tinyest;

type SharedTranspilers = Extract<babel.Node['type'], acorn.AnyNode['type']>;

export const baseTranspilers = {
  Program(ctx, node, transpile) {
    const body = node.body[0];

    if (!body) {
      throw new Error('tgpu.fn was not implemented correctly.');
    }

    return transpile(ctx, body);
  },

  ExpressionStatement(ctx, node, transpile) {
    return transpile(ctx, node.expression);
  },

  ArrowFunctionExpression() {
    throw new Error('Arrow functions are not supported inside TGSL.');
  },

  BlockStatement(ctx, node, transpile) {
    ctx.stack.push({ declaredNames: [] });

    try {
      return [
        NODE.block,
        node.body.map((statement) => transpile(ctx, statement) as tinyest.Statement),
      ] as const;
    } finally {
      ctx.stack.pop();
    }
  },

  ReturnStatement(ctx, node, transpile) {
    return node.argument
      ? [NODE.return, transpile(ctx, node.argument) as tinyest.Expression]
      : [NODE.return];
  },

  Identifier(_ctx, node) {
    return node.name;
  },

  ThisExpression() {
    return 'this';
  },

  BinaryExpression(ctx, node, transpile) {
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;

    return [NODE.binaryExpr, left, node.operator as tinyest.BinaryOperator, right];
  },

  LogicalExpression(ctx, node, transpile) {
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;

    return [NODE.logicalExpr, left, node.operator as tinyest.LogicalOperator, right];
  },

  AssignmentExpression(ctx, node, transpile) {
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;

    return [NODE.assignmentExpr, left, node.operator as tinyest.AssignmentOperator, right];
  },

  UnaryExpression(ctx, node, transpile) {
    const wgslOp = node.operator;
    const argument = transpile(ctx, node.argument) as tinyest.Expression;

    return [NODE.unaryExpr, wgslOp, argument] as tinyest.UnaryExpression;
  },

  MemberExpression(ctx, node, transpile) {
    const object = transpile(ctx, node.object) as tinyest.Expression;

    // If the property is computed, it could potentially be an external identifier.
    if (node.computed) {
      const property = transpile(ctx, node.property) as tinyest.Expression;
      return [NODE.indexAccess, object, property];
    }

    // If the property is not computed, we don't want to register identifiers as external.
    ctx.ignoreExternalDepth++;
    const property = transpile(ctx, node.property) as tinyest.Expression;
    ctx.ignoreExternalDepth--;

    if (typeof property !== 'string') {
      throw new Error('Expected identifier as property access key.');
    }

    return [NODE.memberAccess, object, property];
  },

  UpdateExpression(ctx, node, transpile) {
    const operator = node.operator;
    const argument = transpile(ctx, node.argument) as tinyest.Expression;

    if (node.prefix) {
      throw new Error('Prefix update expressions are not supported in WGSL.');
    }

    return [NODE.postUpdate, operator, argument];
  },

  ConditionalExpression(ctx, node, transpile) {
    const test = transpile(ctx, node.test) as tinyest.Expression;
    const consequent = transpile(ctx, node.consequent) as tinyest.Expression;
    const alternative = transpile(ctx, node.alternate) as tinyest.Expression;

    return [NODE.conditionalExpr, test, consequent, alternative];
  },

  CallExpression(ctx, node, transpile) {
    const callee = transpile(ctx, node.callee) as tinyest.Expression;
    const args = node.arguments.map((argument) => transpile(ctx, argument) as tinyest.Expression);

    return [NODE.call, callee, args];
  },

  ArrayExpression(ctx, node, transpile) {
    return [
      NODE.arrayExpr,
      node.elements.map((element) => {
        if (!element || element.type === 'SpreadElement') {
          throw new Error('Spread elements are not supported in TGSL.');
        }
        return transpile(ctx, element) as tinyest.Expression;
      }),
    ];
  },

  VariableDeclaration(ctx, node, transpile) {
    if (node.declarations.length !== 1 || !node.declarations[0]) {
      throw new Error('Currently only one declaration in a statement is supported.');
    }

    const decl = node.declarations[0];
    ctx.ignoreExternalDepth++;
    const id = transpile(ctx, decl.id);
    ctx.ignoreExternalDepth--;

    if (typeof id !== 'string') {
      throw new Error('Invalid variable declaration, expected identifier.');
    }

    ctx.stack[ctx.stack.length - 1]?.declaredNames.push(id);

    const init = decl.init ? (transpile(ctx, decl.init) as tinyest.Expression) : undefined;

    if (node.kind === 'var') {
      throw new Error('`var` declarations are not supported.');
    }

    if (node.kind === 'const') {
      return init !== undefined ? [NODE.const, id, init] : [NODE.const, id];
    }

    return init !== undefined ? [NODE.let, id, init] : [NODE.let, id];
  },

  IfStatement(ctx, node, transpile) {
    const test = transpile(ctx, node.test) as tinyest.Expression;
    const consequent = transpile(ctx, node.consequent) as tinyest.Statement;
    const alternate = node.alternate
      ? (transpile(ctx, node.alternate) as tinyest.Statement)
      : undefined;

    return alternate ? [NODE.if, test, consequent, alternate] : [NODE.if, test, consequent];
  },

  ForStatement(ctx, node, transpile) {
    ctx.stack.push({ declaredNames: [] });

    const init = node.init ? (transpile(ctx, node.init) as tinyest.Statement) : null;
    const condition = node.test ? (transpile(ctx, node.test) as tinyest.Expression) : null;
    const update = node.update ? (transpile(ctx, node.update) as tinyest.Statement) : null;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    ctx.stack.pop();

    return [NODE.for, init, condition, update, body];
  },

  WhileStatement(ctx, node, transpile) {
    const condition = transpile(ctx, node.test) as tinyest.Expression;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    return [NODE.while, condition, body];
  },

  ForOfStatement(ctx, node, transpile) {
    ctx.stack.push({ declaredNames: [] });

    const loopVar = transpile(ctx, node.left) as tinyest.Const | tinyest.Let;
    const iterable = transpile(ctx, node.right) as tinyest.Expression;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    ctx.stack.pop();

    return [NODE.forOf, loopVar, iterable, body];
  },

  ContinueStatement() {
    return [NODE.continue];
  },

  BreakStatement() {
    return [NODE.break];
  },
} satisfies Pick<Transpilers<JsNode>, SharedTranspilers>;

const acornSpecificTranspilers = {
  Literal(_ctx, node) {
    if (node.regex) {
      throw new Error('Regular expression literals are not representable in WGSL.');
    }
    if (node.raw === 'null') {
      return [NODE.nullLiteral];
    }
    if (typeof node.value === 'boolean') {
      return node.value;
    }
    if (typeof node.value === 'string') {
      return [NODE.stringLiteral, node.value];
    }
    if (node.bigint) {
      console.warn('BigInt literals are represented as numbers - loss of precision may occur.');
    }
    return [NODE.numericLiteral, String(Number(node.value))];
  },

  ObjectExpression(ctx, node, transpile) {
    const properties: Record<string, tinyest.Expression> = {};

    for (const prop of node.properties) {
      // TODO: Handle SpreadElement
      if (prop.type === 'SpreadElement') {
        throw new Error('Spread elements are not supported in TGSL.');
      }

      // TODO: Handle Object method
      if (prop.method) {
        throw new Error('Object method elements are not supported in TGSL.');
      }

      // TODO: Handle computed properties
      if (prop.computed) {
        throw new Error('Computed object properties are not supported in TGSL.');
      }

      if (
        (prop.key.type !== 'Identifier' && prop.key.type !== 'Literal') ||
        (prop.key.type === 'Literal' && (prop.key.raw === null || prop.key.regex))
      ) {
        throw new Error(`Unsupported non-computed object property key.`);
      }

      const key = prop.key.type === 'Identifier' ? prop.key.name : String(prop.key.value);
      const value = transpile(ctx, prop.value) as tinyest.Expression;
      properties[key] = value;
    }

    return [NODE.objectExpr, properties];
  },
} satisfies Transpilers<acorn.AnyNode>;

export const acornTranspilers = {
  ...(baseTranspilers as Pick<Transpilers<acorn.AnyNode>, SharedTranspilers>),
  ...acornSpecificTranspilers,
} satisfies Transpilers<acorn.AnyNode>;

const tsFallthrough = (
  ctx: Context,
  node: { expression: babel.Expression },
  transpile: Transpile<babel.Node>,
) => {
  return transpile(ctx, node.expression);
};

const babelSpecificTranspilers = {
  NumericLiteral(_ctx, node) {
    return [NODE.numericLiteral, String(node.value)];
  },

  BigIntLiteral(_ctx, node) {
    console.warn('BigInt literals are represented as numbers - loss of precision may occur.');
    return [NODE.numericLiteral, String(Number(node.value))];
  },

  BooleanLiteral(_ctx, node) {
    return node.value;
  },

  StringLiteral(_ctx, node) {
    return [NODE.stringLiteral, node.value];
  },

  NullLiteral() {
    return [NODE.nullLiteral];
  },

  ObjectExpression(ctx, node, transpile) {
    const properties: Record<string, tinyest.Expression> = {};

    for (const prop of node.properties) {
      // TODO: Handle SpreadElement
      if (prop.type === 'SpreadElement') {
        throw new Error('Spread elements are not supported in TGSL.');
      }

      // TODO: Handle Object method
      if (prop.type === 'ObjectMethod') {
        throw new Error('Object method elements are not supported in TGSL.');
      }

      // TODO: Handle computed properties
      if (prop.computed) {
        throw new Error('Computed object properties are not supported in TGSL.');
      }

      let key: string;

      switch (prop.key.type) {
        case 'Identifier':
          key = prop.key.name;
          break;

        case 'StringLiteral':
        case 'NumericLiteral':
        case 'BigIntLiteral':
          key = String(prop.key.value);
          break;

        default:
          throw new Error(`Unsupported non-computed object property key.`);
      }

      const value = transpile(ctx, prop.value) as tinyest.Expression;
      properties[key] = value;
    }

    return [NODE.objectExpr, properties];
  },

  TSAsExpression: tsFallthrough,
  TSSatisfiesExpression: tsFallthrough,
  TSNonNullExpression: tsFallthrough,
} satisfies Transpilers<babel.Node>;

export const babelTranspilers = {
  ...(baseTranspilers as Pick<Transpilers<babel.Node>, SharedTranspilers>),
  ...babelSpecificTranspilers,
} satisfies Transpilers<babel.Node>;
