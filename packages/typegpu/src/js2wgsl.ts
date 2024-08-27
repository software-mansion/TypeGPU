import * as acorn from 'acorn';
import type { AnyWgslData, Wgsl } from './types';
import { code } from './wgslCode';

type Context = {
  argTypes: AnyWgslData[];
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

  ExpressionStatement: (ctx, node) => generate(ctx, node.expression),
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

  Identifier(_ctx, node) {
    return node.name;
  },

  BinaryExpression(ctx, node) {
    // TODO: Verify if all binary operators map 1-to-1
    return code`${generate(ctx, node.left)} ${node.operator} ${generate(ctx, node.right)}`;
  },
};

function generate(ctx: Context, node: acorn.AnyNode): Wgsl {
  const generator = Generators[node.type];

  if (!generator) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  return generator(ctx, node as never);
}

export function transpileJsToWgsl(ctx: Context, jsCode: string): Wgsl {
  const program = acorn.parse(jsCode, { ecmaVersion: 'latest' });

  console.log(program);

  return generate(ctx, program);
}
