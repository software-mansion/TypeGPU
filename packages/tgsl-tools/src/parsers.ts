import * as acorn from 'acorn';
import type * as smol from 'typegpu/smol';

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
  [Type in acorn.AnyNode['type']]: (
    ctx: Context,
    node: Extract<acorn.AnyNode, { type: Type }>,
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
      block: node.body.map(
        (statement) => transpile(ctx, statement) as smol.Statement,
      ),
    };

    ctx.stack.pop();

    return result;
  },

  ReturnStatement: (ctx, node) => ({
    return: node.argument
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
    return { x2: [left, wgslOp, right] } as smol.BinaryExpression;
  },

  LogicalExpression(ctx, node) {
    const wgslOp = LOGICAL_OP_MAP[node.operator];
    const left = transpile(ctx, node.left);
    const right = transpile(ctx, node.right);
    return { x2: [left, wgslOp, right] } as smol.LogicalExpression;
  },

  AssignmentExpression(ctx, node) {
    const wgslOp = ASSIGNMENT_OP_MAP[node.operator];
    const left = transpile(ctx, node.left);
    const right = transpile(ctx, node.right);
    return { x2: [left, wgslOp, right] } as smol.AssignmentExpression;
  },

  MemberExpression(ctx, node) {
    const object = transpile(ctx, node.object) as smol.Expression;
    ctx.ignoreExternalDepth++;
    const property = transpile(ctx, node.property) as smol.Expression;
    ctx.ignoreExternalDepth--;

    if (node.computed) {
      return { '[]': [object, property] };
    }

    if (typeof property !== 'string') {
      throw new Error('Expected identifier as property access key.');
    }

    return { '.': [object, property] };
  },

  Literal(ctx, node) {
    if (typeof node.value === 'string') {
      throw new Error('String literals are not supported in TGSL.');
    }
    return { num: node.raw ?? '' };
  },

  CallExpression(ctx, node) {
    const callee = transpile(ctx, node.callee) as smol.Expression;

    const args = node.arguments.map((arg) =>
      transpile(ctx, arg),
    ) as smol.Expression[];

    return { call: callee, args };
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
      return { const: id, eq: init };
    }

    return { let: id, eq: init };
  },

  IfStatement(ctx, node) {
    const test = transpile(ctx, node.test) as smol.Expression;
    const consequent = transpile(ctx, node.consequent) as smol.Statement;
    const alternate = node.alternate
      ? (transpile(ctx, node.alternate) as smol.Statement)
      : undefined;

    return { if: test, do: consequent, else: alternate };
  },
};

function transpile(ctx: Context, node: acorn.AnyNode): smol.AnyNode {
  const transpiler = Transpilers[node.type];

  if (!transpiler) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  return transpiler(ctx, node as never);
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

export function extractFunctionParts(program: acorn.Program): {
  params: acorn.Identifier[];
  body: acorn.BlockStatement | acorn.Expression;
} {
  const programBody = program.body[0];

  if (
    programBody?.type === 'ExpressionStatement' &&
    programBody.expression.type === 'ArrowFunctionExpression'
  ) {
    const mainExpression = programBody.expression;

    if (mainExpression.async) {
      throw new Error('tgpu.fn cannot be async');
    }

    if (mainExpression.params.some((p) => p.type !== 'Identifier')) {
      throw new Error('tgpu.fn implementations require concrete parameters');
    }

    return {
      params: mainExpression.params as acorn.Identifier[],
      body: mainExpression.body,
    };
  }

  if (programBody?.type === 'FunctionDeclaration') {
    const body = programBody.body;

    if (programBody.async) {
      throw new Error('tgpu.fn cannot be async');
    }

    if (programBody.generator) {
      throw new Error('tgpu.fn cannot be a generator');
    }

    if (programBody.params.some((p) => p.type !== 'Identifier')) {
      throw new Error('tgpu.fn implementations require concrete parameters');
    }

    return {
      params: programBody.params as acorn.Identifier[],
      body: body,
    };
  }

  throw new Error(
    `tgpu.fn expected a single function to be passed as implementation ${programBody?.type}`,
  );
}

export function transpileFn(jsCode: string): TranspilationResult {
  const program = acorn.parse(jsCode, { ecmaVersion: 'latest' });

  const { params, body } = extractFunctionParts(program);
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
      block: [{ return: smolBody as smol.Expression }],
    },
    externalNames,
  };
}
