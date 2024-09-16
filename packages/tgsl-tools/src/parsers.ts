import * as acorn from 'acorn';
import type * as smol from 'typegpu/smol';

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
    node: Extract<acorn.AnyNode, { type: Type }>,
  ) => smol.AnyNode;
}> = {
  Program(node) {
    const body = node.body[0];

    if (!body) {
      throw new Error('tgpu.fn was not implemented correctly.');
    }

    return transpile(body);
  },

  ExpressionStatement: (node) => transpile(node.expression),

  ArrowFunctionExpression: (node) => {
    throw new Error('Arrow functions are not supported inside TGSL.');
  },

  BlockStatement: (node) => ({
    block: node.body.map((statement) => transpile(statement) as smol.Statement),
  }),

  ReturnStatement: (node) => ({
    return: node.argument
      ? (transpile(node.argument) as smol.Expression)
      : null,
  }),

  Identifier(node) {
    return node.name;
  },

  BinaryExpression(node) {
    const wgslOp = BINARY_OP_MAP[node.operator];
    const left = transpile(node.left);
    const right = transpile(node.right);
    return { x2: [left, wgslOp, right] } as smol.AnyNode;
  },

  LogicalExpression(node) {
    const wgslOp = LOGICAL_OP_MAP[node.operator];
    const left = transpile(node.left);
    const right = transpile(node.right);
    return { x2: [left, wgslOp, right] } as smol.AnyNode;
  },

  AssignmentExpression(node) {
    const wgslOp = ASSIGNMENT_OP_MAP[node.operator];
    const left = transpile(node.left);
    const right = transpile(node.right);
    return { x2: [left, wgslOp, right] } as smol.AnyNode;
  },

  MemberExpression(node) {
    const object = transpile(node.object) as smol.Expression;
    const property = transpile(node.property) as smol.Expression;

    if (node.computed) {
      return { '[]': [object, property] };
    }

    if (typeof property !== 'string') {
      throw new Error('Expected identifier as property access key.');
    }

    return { '.': [object, property] };
  },

  Literal(node) {
    if (typeof node.value === 'string') {
      throw new Error('String literals are not supported in TGSL.');
    }
    return { num: node.raw ?? '' };
  },

  CallExpression(node) {
    const callee = transpile(node.callee);
    if (typeof callee !== 'string') {
      throw new Error(
        `Can only call functions that are referred to by their identifier. Got: ${JSON.stringify(callee)}`,
      );
    }

    const args = node.arguments.map((arg) =>
      transpile(arg),
    ) as smol.Expression[];

    return { call: callee, args };
  },

  VariableDeclaration(node) {
    if (node.declarations.length !== 1 || !node.declarations[0]) {
      throw new Error(
        'Currently only one declaration in a statement is supported.',
      );
    }

    const decl = node.declarations[0];
    const id = transpile(decl.id);

    if (typeof id !== 'string') {
      throw new Error('Invalid variable declaration, expected identifier.');
    }

    const init = decl.init
      ? (transpile(decl.init) as smol.Expression)
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
      return { let: id, be: init };
    }

    return { var: id, init };
  },

  IfStatement(node) {
    const test = transpile(node.test) as smol.Expression;
    const consequent = transpile(node.consequent) as smol.Statement;
    const alternate = node.alternate
      ? (transpile(node.alternate) as smol.Statement)
      : undefined;

    return { if: test, do: consequent, else: alternate };
  },
};

function transpile(node: acorn.AnyNode): smol.AnyNode {
  const transpiler = Transpilers[node.type];

  if (!transpiler) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  return transpiler(node as never);
}

export function transpileFn(jsCode: string): {
  argNames: string[];
  body: smol.Block;
} {
  const program = acorn.parse(jsCode, { ecmaVersion: 'latest' });

  const programBody = program.body[0];
  if (!programBody || programBody.type !== 'ExpressionStatement') {
    throw new Error(
      'tgpu.fn expected a single function to be passed as implementation',
    );
  }

  const mainExpression = programBody.expression;
  if (mainExpression.type !== 'ArrowFunctionExpression') {
    throw new Error(
      'tgpu.fn expected a single function to be passed as implementation',
    );
  }

  if (mainExpression.async) {
    throw new Error('tgpu.fn cannot be async');
  }

  if (mainExpression.params.some((p) => p.type !== 'Identifier')) {
    throw new Error('tgpu.fn implementations require concrete parameters');
  }

  const params = mainExpression.params as acorn.Identifier[];

  if (mainExpression.body.type === 'BlockStatement') {
    return {
      argNames: params.map((p) => p.name),
      body: transpile(mainExpression.body) as unknown as smol.Block,
    };
  }

  return {
    argNames: params.map((p) => p.name),
    body: {
      block: [{ return: transpile(mainExpression.body) as smol.Expression }],
    },
  };
}
