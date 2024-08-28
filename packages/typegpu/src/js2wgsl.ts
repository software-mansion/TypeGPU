import * as acorn from 'acorn';
import { valueList } from './resolutionUtils';
import { type AnyWgslData, type Wgsl, isNamable, isResolvable } from './types';
import { code } from './wgslCode';

type Context = {
  argTypes: AnyWgslData[];
  externalMap: Record<string, Wgsl>;
  returnType: AnyWgslData | undefined;
};

const Generators: Partial<{
  [Type in acorn.AnyNode['type']]: (
    ctx: Context,
    node: Extract<acorn.AnyNode, { type: Type }>,
  ) => Wgsl;
}> = {
  Program(ctx, node) {
    const body = node.body[0];
    if (!body) {
      throw new Error('tgpu.fn was not implemented correctly.');
    }

    return generate(ctx, body);
  },

  ExpressionStatement: (ctx, node) => code`${generate(ctx, node.expression)};`,
  ArrowFunctionExpression: (ctx, node) => {
    if (node.async) {
      throw new Error('tgpu.fn cannot be async.');
    }

    if (node.params.some((p) => p.type !== 'Identifier')) {
      throw new Error('tgpu.fn implementations require concrete parameters');
    }

    const params = node.params as acorn.Identifier[];
    const header = code`(${params.map((p, idx) => code`${p.name}: ${ctx.argTypes[idx] ?? ''}${idx < params.length - 1 ? ', ' : ''}`)}) ${() => (ctx.returnType ? code`-> ${ctx.returnType}` : '')}`;

    if (node.body.type === 'BlockStatement') {
      return code`${header} ${generate(ctx, node.body)}`;
    }

    return code`${header} {
  return ${generate(ctx, node.body)};
}`;
  },

  BlockStatement(ctx, node) {
    return code`{
  ${node.body.map((statement) => generate(ctx, statement))}
}`;
  },

  ReturnStatement(ctx, node) {
    return code`return ${node.argument ? generate(ctx, node.argument) : ''};`;
  },

  Identifier(ctx, node) {
    const external = ctx.externalMap[node.name];
    if (external) {
      // Since we pass in the external by name, we can then assign it a debug label (Hurray!).
      if (isNamable(external)) {
        external.$name(node.name);
      }
      return external;
    }

    return node.name;
  },

  BinaryExpression(ctx, node) {
    // TODO: Verify if all binary operators map 1-to-1 (they probably do not)
    return code`${generate(ctx, node.left)} ${node.operator} ${generate(ctx, node.right)}`;
  },

  LogicalExpression(ctx, node) {
    const left = generate(ctx, node.left);
    const right = generate(ctx, node.right);
    return code`${left} ${node.operator} ${right}`;
  },

  AssignmentExpression(ctx, node) {
    // TODO: Verify if all assignment operators map 1-to-1 (they probably do not)
    return code`${generate(ctx, node.left)} ${node.operator} ${generate(ctx, node.right)}`;
  },

  MemberExpression(ctx, node) {
    const object = generate(ctx, node.object);
    const property = generate(ctx, node.property);

    if (object === 'std') {
      // All values on `std.` should exist in the WGSL global scope, so fallback.
      return property;
    }

    if (isResolvable(object)) {
      // A resolvable, for now we can use that fact to assume it is external

      if (property === 'value' && 'value' in object) {
        // .value is a special property of external resources, giving access to the value within.
        return object.value as Wgsl;
      }
    }

    if (node.computed) {
      return code`${object}[${property}]`;
    }

    return code`${object}.${property}`;
  },

  Literal(_ctx, node) {
    return node.raw ?? '';
  },

  CallExpression(ctx, node) {
    const callee = generate(ctx, node.callee);
    const args = node.arguments.map((arg) => generate(ctx, arg));

    if (isResolvable(callee)) {
      // A resolvable, for now we can use that fact to assume it is external

      return (callee as unknown as (...a: typeof args) => Wgsl)(...args);
    }

    return code`${callee}(${valueList(args)})`;
  },

  VariableDeclaration(ctx, node) {
    if (node.declarations.length !== 1 || !node.declarations[0]) {
      throw new Error(
        'Currently only one declaration in a statement is supported.',
      );
    }

    const decl = node.declarations[0];

    return code`let ${generate(ctx, decl.id)} ${decl.init ? code`= ${generate(ctx, decl.init)}` : ''};`;
  },

  IfStatement(ctx, node) {
    const test = generate(ctx, node.test);
    const consequent = generate(ctx, node.consequent);
    const alternate = node.alternate ? generate(ctx, node.alternate) : null;

    return code`if (${test}) ${consequent} ${alternate ? code`else ${alternate}` : ''}`;
  },
};

function generate(ctx: Context, node: acorn.AnyNode): Wgsl {
  const generator = Generators[node.type];

  if (!generator) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  return generator(ctx, node as never);
}

export function transpileJsToWgsl(
  ctx: Context,
  jsCode: string,
): { signature: Wgsl; body: Wgsl } {
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
  const signature = code`(${params.map((p, idx) => code`${p.name}: ${ctx.argTypes[idx] ?? ''}${idx < params.length - 1 ? ', ' : ''}`)}) ${() => (ctx.returnType ? code`-> ${ctx.returnType}` : '')}`;

  if (mainExpression.body.type === 'BlockStatement') {
    return {
      signature,
      body: generate(ctx, mainExpression.body),
    };
  }

  return {
    signature,
    body: code`{
  return ${generate(ctx, mainExpression.body)};
}`,
  };
}
