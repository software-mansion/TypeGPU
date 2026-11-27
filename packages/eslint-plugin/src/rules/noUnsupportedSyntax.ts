import type { TSESTree } from '@typescript-eslint/utils';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const noUnsupportedSyntax = createRule({
  name: 'no-unsupported-syntax',
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow JS syntax that will not be parsed into valid WGSL.`,
    },
    messages: {
      unexpected:
        "'{{snippet}}' will not parse into valid WGSL because it uses unsupported syntax: {{syntax}}.",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    function report(node: TSESTree.Node, syntax: string) {
      context.report({
        node,
        messageId: 'unexpected',
        data: { snippet: context.sourceCode.getText(node), syntax },
      });
    }

    function validateFunctionParameters(
      node:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression
        | TSESTree.FunctionDeclaration,
    ) {
      if (directives.getEnclosingTypegpuFunction() !== node) {
        return;
      }

      for (const parameter of node.params) {
        if (
          parameter.type !== 'Identifier' &&
          parameter.type !== 'ObjectPattern' &&
          parameter.type !== 'ArrayPattern' && // Unsupported, reported by ArrayPattern visitor
          parameter.type !== 'AssignmentPattern' // Unsupported, reported by AssignmentPattern visitor
        ) {
          report(parameter, 'unsupported function parameter binding pattern');
        }
      }
    }

    return {
      ArrayPattern(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }

        // The outer pattern reports unsupported nested destructuring
        if (isNestedInDestructuringPattern(node)) {
          return;
        }

        report(node, 'array destructuring');
      },

      ArrowFunctionExpression(node) {
        validateFunctionParameters(node);
        if (directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')) {
          report(node, 'arrow function');
        }
      },

      AssignmentExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (unsupportedAssignmentOps.includes(node.operator)) {
          report(node, `assignment expression '${node.operator}'`);
        }
      },

      AssignmentPattern(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'assignment pattern (default parameter)');
      },

      AwaitExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'await expression');
      },

      BinaryExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (unsupportedBinaryOps.includes(node.operator)) {
          report(node, `binary operator '${node.operator}'`);
        }
      },

      ChainExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'chain expression');
      },

      ClassDeclaration(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'class declaration');
      },

      ClassExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'class expression');
      },

      DoWhileStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'do-while loop');
      },

      ForInStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'for-in loop');
      },

      FunctionDeclaration(node) {
        validateFunctionParameters(node);
        if (directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')) {
          report(node, 'function declaration');
        }
      },

      FunctionExpression(node) {
        validateFunctionParameters(node);
        if (directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')) {
          report(node, 'function expression');
        }
      },

      Literal(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if ('regex' in node && node.regex) {
          report(node, 'regular expression literal');
        }
      },

      LogicalExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.operator === '??') {
          report(node, 'nullish coalescing');
        }
      },

      NewExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, `'new' expression`);
      },

      ObjectPattern(node) {
        const gpuFunction = directives.getEnclosingTypegpuFunction();
        if (!gpuFunction) {
          return;
        }

        // The outer pattern reports unsupported nested destructuring
        if (isNestedInDestructuringPattern(node)) {
          return;
        }

        const parent = node.parent;
        const isVariableDeclaration =
          parent.type === 'VariableDeclarator' &&
          parent.parent.type === 'VariableDeclaration' &&
          (parent.parent.parent.type === 'BlockStatement' ||
            parent.parent.parent.type === 'SwitchCase');
        const isFunctionParameter =
          parent === gpuFunction ||
          // Unwrap default parameters so AssignmentPattern reports them instead of object destructuring.
          (parent.type === 'AssignmentPattern' &&
            parent.left === node &&
            parent.parent === gpuFunction);

        if (
          (isVariableDeclaration || isFunctionParameter) &&
          isSupportedObjectBindingPattern(node)
        ) {
          return;
        }

        report(node, 'object destructuring');
      },

      SequenceExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'sequence expression (comma operator)');
      },

      SpreadElement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'spread element');
      },

      TemplateLiteral(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'template literal');
      },

      ThrowStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'throw statement');
      },

      TryStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'try-catch statement');
      },

      UnaryExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (unsupportedUnaryOps.includes(node.operator)) {
          report(node, `unary operator '${node.operator}'`);
        }
      },

      UpdateExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.prefix) {
          report(node, 'prefix update expression');
        }
      },

      VariableDeclaration(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.kind === 'var') {
          report(node, `'var' declaration`);
        }
        if (node.declarations.length > 1) {
          report(node, 'multiple variable declarations in one statement');
        }
      },

      YieldExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'yield expression');
      },
    };
  }),
});

const unsupportedAssignmentOps = ['&&=', '**=', '||=', '??='];
const unsupportedBinaryOps = ['==', '!=', 'in', 'instanceof', '|>'];
const unsupportedUnaryOps = ['+', 'typeof', 'void', 'delete'];

function isNestedInDestructuringPattern(
  node: TSESTree.ArrayPattern | TSESTree.ObjectPattern,
): boolean {
  let parent = node.parent;
  // Unwrap default values (e.g. `{ a: { b } = {} }`) so only the outer pattern reports nesting.
  if (parent.type === 'AssignmentPattern' && parent.left === node) {
    parent = parent.parent;
  }
  return (
    parent.type === 'ArrayPattern' ||
    parent.type === 'RestElement' ||
    (parent.type === 'Property' && parent.parent.type === 'ObjectPattern')
  );
}

function isSupportedObjectBindingPattern(pattern: TSESTree.ObjectPattern): boolean {
  return pattern.properties.every(
    (prop) =>
      prop.type === 'Property' &&
      !prop.computed &&
      prop.key.type === 'Identifier' &&
      prop.value.type === 'Identifier',
  );
}
