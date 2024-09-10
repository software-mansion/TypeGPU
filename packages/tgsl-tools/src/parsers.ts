import * as acorn from 'acorn';
import {
  type AnyTgpuData,
  type Wgsl,
  isNamable,
  isResolvable,
  wgsl,
} from 'typegpu/experimental';
import { valueList } from './resolutionUtils';

type Context = {
  argTypes: AnyTgpuData[];
  externalMap: Record<string, Wgsl>;
  returnType: AnyTgpuData | undefined;
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

  ExpressionStatement: (ctx, node) => wgsl`${generate(ctx, node.expression)};`,
  ArrowFunctionExpression: (ctx, node) => {
    if (node.async) {
      throw new Error('tgpu.fn cannot be async.');
    }

    if (node.params.some((p) => p.type !== 'Identifier')) {
      throw new Error('tgpu.fn implementations require concrete parameters');
    }

    const params = node.params as acorn.Identifier[];
    const header = wgsl`(${valueList(params.map((p, idx) => wgsl`${p.name}: ${ctx.argTypes[idx] ?? ''}`))}) ${ctx.returnType ? wgsl`-> ${ctx.returnType}` : ''}`;

    if (node.body.type === 'BlockStatement') {
      return wgsl`${header} ${generate(ctx, node.body)}`;
    }

    return wgsl`${header} {
  return ${generate(ctx, node.body)};
}`;
  },

  BlockStatement(ctx, node) {
    return wgsl`{
  ${node.body.map((statement) => generate(ctx, statement))}
}`;
  },

  ReturnStatement(ctx, node) {
    return wgsl`return ${node.argument ? generate(ctx, node.argument) : ''};`;
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
    return wgsl`${generate(ctx, node.left)} ${node.operator} ${generate(ctx, node.right)}`;
  },

  LogicalExpression(ctx, node) {
    const left = generate(ctx, node.left);
    const right = generate(ctx, node.right);
    return wgsl`${left} ${node.operator} ${right}`;
  },

  AssignmentExpression(ctx, node) {
    // TODO: Verify if all assignment operators map 1-to-1 (they probably do not)
    return wgsl`${generate(ctx, node.left)} ${node.operator} ${generate(ctx, node.right)}`;
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
      return wgsl`${object}[${property}]`;
    }

    return wgsl`${object}.${property}`;
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

    return wgsl`${callee}(${valueList(args)})`;
  },

  VariableDeclaration(ctx, node) {
    if (node.declarations.length !== 1 || !node.declarations[0]) {
      throw new Error(
        'Currently only one declaration in a statement is supported.',
      );
    }

    const decl = node.declarations[0];

    return wgsl`let ${generate(ctx, decl.id)} ${decl.init ? wgsl`= ${generate(ctx, decl.init)}` : ''};`;
  },

  IfStatement(ctx, node) {
    const test = generate(ctx, node.test);
    const consequent = generate(ctx, node.consequent);
    const alternate = node.alternate ? generate(ctx, node.alternate) : null;

    return wgsl`if (${test}) ${consequent} ${alternate ? wgsl`else ${alternate}` : ''}`;
  },
};

function generate(ctx: Context, node: acorn.AnyNode): Wgsl {
  const generator = Generators[node.type];

  if (!generator) {
    throw new Error(`Unsupported JS functionality: ${node.type}`);
  }

  return generator(ctx, node as never);
}

export function transpileFn(
  ctx: Context,
  jsCode: string,
): { head: Wgsl; body: Wgsl } {
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
  const signature = wgsl`(${params.map((p, idx) => wgsl`${p.name}: ${ctx.argTypes[idx] ?? ''}${idx < params.length - 1 ? ', ' : ''}`)}) ${() => (ctx.returnType ? wgsl`-> ${ctx.returnType}` : '')}`;

  if (mainExpression.body.type === 'BlockStatement') {
    return {
      head: signature,
      body: generate(ctx, mainExpression.body),
    };
  }

  return {
    head: signature,
    body: wgsl`{
  return ${generate(ctx, mainExpression.body)};
}`,
  };
}
