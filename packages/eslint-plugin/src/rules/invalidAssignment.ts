import { ASTUtils, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../ruleCreator.ts';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { getBaseFromAccessChain } from '../utils/nodeUtils.ts';

export const invalidAssignment = createRule({
  name: 'invalid-assignment',
  meta: {
    type: 'problem',
    docs: {
      description: `Avoid assignments that will not generate valid WGSL.`,
    },
    messages: {
      parameterAssignment:
        "Cannot assign to '{{snippet}}' since WGSL parameters are immutable.",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      AssignmentExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }

        // look for the definition of the variable we assign to
        const assignee = getBaseFromAccessChain(node.left);
        const variable = ASTUtils.findVariable(
          context.sourceCode.getScope(assignee),
          assignee.name,
        );
        if (variable && variable.defs.length > 0) {
          const def = variable.defs[0]; // first definition in this scope

          // was it defined as a parameter?
          if (def?.type === 'Parameter') {
            context.report({
              messageId: 'parameterAssignment',
              node,
              data: { snippet: context.sourceCode.getText(node.left) },
            });
          }
        }
      },
    };
  }),
});
