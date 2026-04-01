import type { TSESTree } from '@typescript-eslint/utils';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const noUnsupportedSyntax = createRule({
  name: 'no-unsupported-syntax',
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow JS syntax that will not be parsed to correct WGSL.`,
    },
    messages: {
      unexpected:
        "'{{snippet}}' will not parse to correct WGSL because it uses unsupported syntax: {{syntax}}.",
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

    return {
      ArrowFunctionExpression(node) {
        if (
          directives.getDirectiveStack().length >= 2 &&
          directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')
        ) {
          report(node, 'arrow function');
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
        if (node.operator === '==') {
          report(node, 'eqeq');
        }
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
        if (
          directives.getDirectiveStack().length >= 2 &&
          directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')
        ) {
          report(node, 'function declaration');
        }
      },

      FunctionExpression(node) {
        if (
          directives.getDirectiveStack().length >= 2 &&
          directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')
        ) {
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

      NewExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, `'new' expression`);
      },

      PrivateIdentifier(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'private identifier');
      },

      Property(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.method) {
          report(node, 'object method shorthand');
        }
        if (node.computed) {
          report(node, 'computed property key');
        }
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

      SwitchStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'switch statement');
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
          report(node, 'Multiple variable declarations in one statement');
        }
      },

      VariableDeclarator(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.id.type !== 'Identifier') {
          report(node, 'variable declaration using destructuring');
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
