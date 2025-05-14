import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';

const { NodeTypeCatalog: NODE } = tinyest;

type Scope = {
  /** identifiers declared in this scope */
  declaredNames: string[];
};

type Context = {
  /** Holds a set of all identifiers that were used in code, but were not declared in code. */
  externalNames: Set<string>;
  /** Used to signal to identifiers that they should not treat their resolution as possible external uses. */
  ignoreExternalDepth: number;
  stack: Scope[];
};

type JsNode = babel.Node | acorn.AnyNode;

function isDeclared(ctx: Context, name: string) {
  return ctx.stack.some((scope) => scope.declaredNames.includes(name));
}

const BINARY_OP_MAP = {
  '==': '==',
  '!=': '!=',
  '===': '==',
  '!==': '!=',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
  '<<': '<<',
  '>>': '>>',
  get '>>>'(): never {
    throw new Error('The `>>>` operator is unsupported in TGSL.');
  },
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '%': '%',
  '|': '|',
  '^': '^',
  '&': '&',
  get in(): never {
    throw new Error('The `in` operator is unsupported in TGSL.');
  },
  get instanceof(): never {
    throw new Error('The `instanceof` operator is unsupported in TGSL.');
  },
  get '**'(): never {
    // TODO: Translate 'a ** b' into 'pow(a, b)'.
    throw new Error(
      'The `**` operator is unsupported in TGSL. Use std.pow() instead.',
    );
  },
  get '|>'(): never {
    throw new Error('The `|>` operator is unsupported in TGSL.');
  },
} as const;

const LOGICAL_OP_MAP = {
  '||': '||',
  '&&': '&&',
  get '??'(): never {
    throw new Error('The `??` operator is unsupported in TGSL.');
  },
} as const;

const ASSIGNMENT_OP_MAP = {
  '=': '=',
  '+=': '+=',
  '-=': '-=',
  '*=': '*=',
  '/=': '/=',
  '%=': '%=',
  '<<=': '<<=',
  '>>=': '>>=',
  get '>>>='(): never {
    throw new Error('The `>>>=` operator is unsupported in TGSL.');
  },
  '|=': '|=',
  '^=': '^=',
  '&=': '&=',
  '**=': '**=',
  '||=': '||=',
  '&&=': '&&=',
  get '??='(): never {
    throw new Error('The `??=` operator is unsupported in TGSL.');
  },
} as const;

const Transpilers: Partial<
  {
    [Type in JsNode['type']]: (
      ctx: Context,
      node: Extract<JsNode, { type: Type }>,
    ) => tinyest.AnyNode;
  }
> = {
  Program(ctx, node) {
    const body = node.body[0];

    if (!body) {
      throw new Error('tgpu.fn was not implemented correctly.');
    }

    return transpile(ctx, body);
  },

  ExpressionStatement: (ctx, node) => transpile(ctx, node.expression),

  ArrowFunctionExpression: (ctx, node) => {
    throw new Error('Arrow functions are not supported inside TGSL.');
  },

  BlockStatement(ctx, node) {
    ctx.stack.push({ declaredNames: [] });

    const result = [
      NODE.block,
      node.body.map(
        (statement) => transpile(ctx, statement) as tinyest.Statement,
      ),
    ] as const;

    ctx.stack.pop();

    return result;
  },

  ReturnStatement: (ctx, node) =>
    node.argument
      ? [NODE.return, transpile(ctx, node.argument) as tinyest.Expression]
      : [NODE.return],

  Identifier(ctx, node) {
    if (ctx.ignoreExternalDepth === 0 && !isDeclared(ctx, node.name)) {
      ctx.externalNames.add(node.name);
    }

    return node.name;
  },

  BinaryExpression(ctx, node) {
    const wgslOp = BINARY_OP_MAP[node.operator];
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;
    return [NODE.binaryExpr, left, wgslOp, right];
  },

  LogicalExpression(ctx, node) {
    const wgslOp = LOGICAL_OP_MAP[node.operator];
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;
    return [NODE.logicalExpr, left, wgslOp, right];
  },

  AssignmentExpression(ctx, node) {
    const wgslOp = ASSIGNMENT_OP_MAP[node.operator as acorn.AssignmentOperator];
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;
    return [NODE.assignmentExpr, left, wgslOp, right];
  },

  UnaryExpression(ctx, node) {
    const wgslOp = node.operator;
    const argument = transpile(ctx, node.argument) as tinyest.Expression;
    return [NODE.unaryExpr, wgslOp, argument] as tinyest.UnaryExpression;
  },

  MemberExpression(ctx, node) {
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

  UpdateExpression(ctx, node) {
    const operator = node.operator;
    const argument = transpile(ctx, node.argument) as tinyest.Expression;
    if (node.prefix) {
      throw new Error('Prefix update expressions are not supported in WGSL.');
    }
    return [NODE.postUpdate, operator, argument];
  },

  Literal(ctx, node) {
    if (typeof node.value === 'boolean') {
      return node.value;
    }
    if (typeof node.value === 'string') {
      return [NODE.stringLiteral, node.value];
    }
    return [NODE.numericLiteral, node.raw ?? ''];
  },

  NumericLiteral(ctx, node) {
    return [NODE.numericLiteral, String(node.value) ?? ''];
  },

  BooleanLiteral(ctx, node) {
    return node.value;
  },

  StringLiteral(ctx, node) {
    return [NODE.stringLiteral, node.value];
  },

  CallExpression(ctx, node) {
    const callee = transpile(ctx, node.callee) as tinyest.Expression;

    const args = node.arguments.map((arg) =>
      transpile(ctx, arg)
    ) as tinyest.Expression[];

    return [NODE.call, callee, args];
  },

  ArrayExpression: (ctx, node) => [
    NODE.arrayExpr,
    node.elements.map((elem) => {
      if (!elem || elem.type === 'SpreadElement') {
        throw new Error('Spread elements are not supported in TGSL.');
      }
      return transpile(ctx, elem) as tinyest.Expression;
    }),
  ],

  VariableDeclaration(ctx, node) {
    if (node.declarations.length !== 1 || !node.declarations[0]) {
      throw new Error(
        'Currently only one declaration in a statement is supported.',
      );
    }

    const decl = node.declarations[0];
    ctx.ignoreExternalDepth++;
    const id = transpile(ctx, decl.id);
    ctx.ignoreExternalDepth--;

    if (typeof id !== 'string') {
      throw new Error('Invalid variable declaration, expected identifier.');
    }

    ctx.stack[ctx.stack.length - 1]?.declaredNames.push(id);

    const init = decl.init
      ? (transpile(ctx, decl.init) as tinyest.Expression)
      : undefined;

    if (node.kind === 'var') {
      throw new Error('`var` declarations are not supported.');
    }

    if (node.kind === 'const') {
      if (init === undefined) {
        throw new Error(
          'Did not provide initial value in `const` declaration.',
        );
      }
      return [NODE.const, id, init];
    }

    return init !== undefined ? [NODE.let, id, init] : [NODE.let, id];
  },

  IfStatement(ctx, node) {
    const test = transpile(ctx, node.test) as tinyest.Expression;
    const consequent = transpile(ctx, node.consequent) as tinyest.Statement;
    const alternate = node.alternate
      ? (transpile(ctx, node.alternate) as tinyest.Statement)
      : undefined;

    return alternate
      ? [NODE.if, test, consequent, alternate]
      : [NODE.if, test, consequent];
  },

  ObjectExpression(ctx, node) {
    const properties: Record<string, tinyest.Expression> = {};

    for (const prop of node.properties) {
      // TODO: Handle SpreadElement
      if (prop.type === 'SpreadElement') {
        throw new Error('Spread elements are not supported in TGSL.');
      }

      // TODO: Handle computed properties
      if (prop.key.type !== 'Identifier' && prop.key.type !== 'Literal') {
        throw new Error(
          'Only Identifier and Literal keys are supported as object keys.',
        );
      }

      // TODO: Handle Object method
      if (prop.type === 'ObjectMethod') {
        throw new Error('Object method elements are not supported in TGSL.');
      }

      ctx.ignoreExternalDepth++;
      const key = prop.key.type === 'Identifier'
        ? (transpile(ctx, prop.key) as string)
        : String(prop.key.value);
      ctx.ignoreExternalDepth--;
      const value = transpile(ctx, prop.value) as tinyest.Expression;

      properties[key] = value;
    }

    return [NODE.objectExpr, properties];
  },

  ForStatement(ctx, node) {
    const init = node.init
      ? (transpile(ctx, node.init) as tinyest.Statement)
      : null;
    const condition = node.test
      ? (transpile(ctx, node.test) as tinyest.Expression)
      : null;
    const update = node.update
      ? (transpile(ctx, node.update) as tinyest.Statement)
      : null;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    return [NODE.for, init, condition, update, body];
  },

  WhileStatement(ctx, node) {
    const condition = transpile(ctx, node.test) as tinyest.Expression;
    const body = transpile(ctx, node.body) as tinyest.Statement;
    return [NODE.while, condition, body];
  },

  ContinueStatement() {
    return [NODE.continue];
  },

  BreakStatement() {
    return [NODE.break];
  },

  TSAsExpression(ctx, node) {
    return transpile(ctx, node.expression);
  },

  TSSatisfiesExpression(ctx, node) {
    return transpile(ctx, node.expression);
  },
};

function transpile(ctx: Context, node: JsNode): tinyest.AnyNode {
  const transpiler = Transpilers[node.type];

  if (!transpiler) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  // @ts-ignore <too much for typescript, it seems :/ >
  return transpiler(ctx, node);
}

export type TranspilationResult = {
  argNames: tinyest.ArgNames;
  body: tinyest.Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: string[];
};

export function extractFunctionParts(rootNode: JsNode): {
  params: tinyest.ArgNames;
  body:
    | acorn.BlockStatement
    | acorn.Expression
    | babel.BlockStatement
    | babel.Expression;
} {
  let functionNode:
    | acorn.ArrowFunctionExpression
    | acorn.FunctionExpression
    | acorn.FunctionDeclaration
    | acorn.AnonymousFunctionDeclaration
    | babel.ArrowFunctionExpression
    | babel.FunctionExpression
    | babel.FunctionDeclaration
    | null = null;

  // Unwrapping until we get to a function
  let unwrappedNode = rootNode;
  while (true) {
    if (unwrappedNode.type === 'Program') {
      const statement = unwrappedNode.body.filter(
        (n) =>
          n.type === 'ExpressionStatement' || n.type === 'FunctionDeclaration',
      )[0]; // <- assuming only one function declaration

      if (!statement) {
        break;
      }

      unwrappedNode = statement;
    } else if (unwrappedNode.type === 'ExpressionStatement') {
      unwrappedNode = unwrappedNode.expression;
    } else if (unwrappedNode.type === 'ArrowFunctionExpression') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else if (unwrappedNode.type === 'FunctionExpression') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else if (unwrappedNode.type === 'FunctionDeclaration') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else {
      // Unsupported node
      break;
    }
  }

  if (!functionNode) {
    throw new Error(
      `tgpu.fn expected a single function to be passed as implementation ${
        JSON.stringify(unwrappedNode)
      }`,
    );
  }

  if (functionNode.async) {
    throw new Error('tgpu.fn cannot be async');
  }

  if (functionNode.generator) {
    throw new Error('tgpu.fn cannot be a generator');
  }

  // destructured object argument
  if (
    functionNode.params[0] &&
    functionNode.params[0].type === 'ObjectPattern'
  ) {
    return {
      params: {
        type: 'destructured-object',
        props: functionNode.params[0].properties.flatMap((prop) =>
          (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
            prop.key.type === 'Identifier' &&
            prop.value.type === 'Identifier'
            ? [{ prop: prop.key.name, alias: prop.value.name }]
            : []
        ),
      },
      body: functionNode.body,
    };
  }

  return {
    params: {
      type: 'identifiers',
      names: functionNode.params.flatMap((x) =>
        x.type === 'Identifier' ? [x.name] : []
      ),
    },
    body: functionNode.body,
  };
}

export function transpileFn(rootNode: JsNode): TranspilationResult {
  const { params: argNames, body } = extractFunctionParts(rootNode);

  const ctx: Context = {
    externalNames: new Set(),
    ignoreExternalDepth: 0,
    stack: [
      {
        declaredNames: argNames.type === 'identifiers'
          ? argNames.names
          : argNames.props.map((prop) => prop.alias),
      },
    ],
  };

  const tinyestBody = transpile(ctx, body);
  const externalNames = [...ctx.externalNames];

  if (body.type === 'BlockStatement') {
    return {
      argNames,
      body: tinyestBody as tinyest.Block,
      externalNames,
    };
  }

  return {
    argNames,
    body: [NODE.block, [[NODE.return, tinyestBody as tinyest.Expression]]],
    externalNames,
  };
}

export function transpileNode(node: JsNode): tinyest.AnyNode {
  const ctx: Context = {
    externalNames: new Set(),
    ignoreExternalDepth: 0,
    stack: [
      {
        declaredNames: [],
      },
    ],
  };

  return transpile(ctx, node);
}
