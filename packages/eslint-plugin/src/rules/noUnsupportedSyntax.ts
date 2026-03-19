import { TSESTree } from '@typescript-eslint/utils';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

// TODO: go through the entire AST to check what was missed
export const noUnsupportedSyntax = createRule({
  name: 'no-unsupported-syntax',
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow JS syntax that will not be parsed to correct WGSL.`,
    },
    messages: {
      unsupportedSyntax:
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
        messageId: 'unsupportedSyntax',
        data: { snippet: context.sourceCode.getText(node), syntax },
      });
    }

    return {
      ArrowFunctionExpression() {
        // TODO: needs to know if parent is inside useGpu
      },

      AssignmentPattern(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'assignment pattern (default parameter)');
      },

      AwaitExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'await expression');
      },

      ClassDeclaration(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'class declaration');
      },

      ClassExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'class expression');
      },

      DoWhileStatement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'do-while loop');
      },

      ForInStatement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'for-in loop');
      },

      FunctionDeclaration() {
        // TODO: needs to know if parent is inside useGpu
      },

      FunctionExpression() {
        // TODO: needs to know if parent is inside useGpu
      },

      Literal(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        if ('regex' in node && node.regex) {
          report(node, 'regular expression literal');
        }
      },

      NewExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, `'new' expression`);
      },

      Property(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        if (node.method === true) {
          report(node, 'object method shorthand');
        }
        if (node.computed === true) {
          report(node, 'computed property key');
        }
      },

      SequenceExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'sequence expression (comma operator)');
      },

      SpreadElement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'spread element');
      },

      SwitchStatement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'switch statement');
      },

      TaggedTemplateExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'tagged template expression');
      },

      TemplateLiteral(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'template literal');
      },

      ThrowStatement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'throw statement');
      },

      TryStatement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'try-catch statement');
      },

      UpdateExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        if (node.prefix === true) {
          report(node, 'prefix update expression');
        }
      },

      VariableDeclaration(node) {
        if (!directives.insideUseGpu()) {
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
        if (!directives.insideUseGpu()) {
          return;
        }
        if (node.id.type !== 'Identifier') {
          report(node, 'variable declaration using destructuring');
        }
      },

      YieldExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        report(node, 'yield expression');
      },
    };
  }),
});
