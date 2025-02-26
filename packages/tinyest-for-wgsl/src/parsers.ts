import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import type * as smol from 'tinyest';

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

const Transpilers: Partial<{
  [Type in JsNode['type']]: (
    ctx: Context,
    node: Extract<JsNode, { type: Type }>,
  ) => smol.AnyNode;
}> = {
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

    const result = {
      b: node.body.map(
        (statement) => transpile(ctx, statement) as smol.Statement,
      ),
    };

    ctx.stack.pop();

    return result;
  },

  ReturnStatement: (ctx, node) => ({
    r: node.argument
      ? (transpile(ctx, node.argument) as smol.Expression)
      : null,
  }),

  Identifier(ctx, node) {
    if (ctx.ignoreExternalDepth === 0 && !isDeclared(ctx, node.name)) {
      ctx.externalNames.add(node.name);
    }

    return node.name;
  },

  BinaryExpression(ctx, node) {
    const wgslOp = BINARY_OP_MAP[node.operator];
    const left = transpile(ctx, node.left);
    const right = transpile(ctx, node.right);
    return { x: [left, wgslOp, right] } as smol.BinaryExpression;
  },

  LogicalExpression(ctx, node) {
    const wgslOp = LOGICAL_OP_MAP[node.operator];
    const left = transpile(ctx, node.left);
    const right = transpile(ctx, node.right);
    return { x: [left, wgslOp, right] } as smol.LogicalExpression;
  },

  AssignmentExpression(ctx, node) {
    const wgslOp = ASSIGNMENT_OP_MAP[node.operator as acorn.AssignmentOperator];
    const left = transpile(ctx, node.left);
    const right = transpile(ctx, node.right);
    return { x: [left, wgslOp, right] } as smol.AssignmentExpression;
  },

  UnaryExpression(ctx, node) {
    const wgslOp = node.operator;
    const argument = transpile(ctx, node.argument);
    return { u: [wgslOp, argument] } as smol.UnaryExpression;
  },

  MemberExpression(ctx, node) {
    const object = transpile(ctx, node.object) as smol.Expression;

    // If the property is computed, it could potentially be an external identifier.
    if (node.computed) {
      const property = transpile(ctx, node.property) as smol.Expression;
      return { i: [object, property] };
    }

    // If the property is not computed, we don't want to register identifiers as external.
    ctx.ignoreExternalDepth++;
    const property = transpile(ctx, node.property) as smol.Expression;
    ctx.ignoreExternalDepth--;

    if (typeof property !== 'string') {
      throw new Error('Expected identifier as property access key.');
    }

    return { a: [object, property] };
  },

  Literal(ctx, node) {
    if (typeof node.value === 'boolean') {
      return node.value;
    }
    if (typeof node.value === 'string') {
      return { s: node.value };
    }
    return { n: node.raw ?? '' };
  },

  NumericLiteral(ctx, node) {
    return { n: String(node.value) ?? '' };
  },

  CallExpression(ctx, node) {
    const callee = transpile(ctx, node.callee) as smol.Expression;

    const args = node.arguments.map((arg) =>
      transpile(ctx, arg),
    ) as smol.Expression[];

    return { f: [callee, args] };
  },

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
      ? (transpile(ctx, decl.init) as smol.Expression)
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
      return { c: [id, init] };
    }

    return { l: init ? [id, init] : [id] };
  },

  IfStatement(ctx, node) {
    const test = transpile(ctx, node.test) as smol.Expression;
    const consequent = transpile(ctx, node.consequent) as smol.Statement;
    const alternate = node.alternate
      ? (transpile(ctx, node.alternate) as smol.Statement)
      : undefined;

    return {
      q: alternate ? [test, consequent, alternate] : [test, consequent],
    };
  },

  ObjectExpression(ctx, node) {
    const properties: Record<string, smol.Expression> = {};

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
      const key =
        prop.key.type === 'Identifier'
          ? (transpile(ctx, prop.key) as string)
          : String(prop.key.value);
      ctx.ignoreExternalDepth--;
      const value = transpile(ctx, prop.value) as smol.Expression;

      properties[key] = value;
    }

    return { o: properties };
  },
};

function transpile(ctx: Context, node: JsNode): smol.AnyNode {
  const transpiler = Transpilers[node.type];

  if (!transpiler) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  // @ts-ignore <too much for typescript, it seems :/ >
  return transpiler(ctx, node);
}

export type TranspilationResult = {
  argNames: string[];
  body: smol.Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: string[];
};

export function extractFunctionParts(rootNode: JsNode): {
  params: acorn.Identifier[];
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
      `tgpu.fn expected a single function to be passed as implementation ${JSON.stringify(unwrappedNode)}`,
    );
  }

  if (functionNode.async) {
    throw new Error('tgpu.fn cannot be async');
  }

  if (functionNode.generator) {
    throw new Error('tgpu.fn cannot be a generator');
  }

  if (functionNode.params.some((p) => p.type !== 'Identifier')) {
    throw new Error('tgpu.fn implementations require concrete parameters');
  }

  return {
    params: functionNode.params as acorn.Identifier[],
    body: functionNode.body,
  };
}

export function transpileFn(rootNode: JsNode): TranspilationResult {
  const { params, body } = extractFunctionParts(rootNode);
  const argNames = params.map((p) => p.name);

  const ctx: Context = {
    externalNames: new Set(),
    ignoreExternalDepth: 0,
    stack: [
      {
        declaredNames: [...argNames],
      },
    ],
  };

  const smolBody = transpile(ctx, body);
  const externalNames = [...ctx.externalNames];

  if (body.type === 'BlockStatement') {
    return {
      argNames,
      body: smolBody as smol.Block,
      externalNames,
    };
  }

  return {
    argNames,
    body: {
      b: [{ r: smolBody as smol.Expression }],
    },
    externalNames,
  };
}

export function transpileNode(node: JsNode): smol.AnyNode {
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
