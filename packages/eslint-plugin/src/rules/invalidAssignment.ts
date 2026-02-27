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
        if (assignee.type !== 'Identifier') {
          return;
        }

        // look for a scope that contains at least one
        const defs = ASTUtils.findVariable(
          context.sourceCode.getScope(assignee),
          assignee.name,
        )?.defs;

        if (defs && defs.length > 0) {
          // def[0] points to the correct scope
          // defs is an array because there may be multiple definitions with `var`
          const def = defs[0];

          if (def?.type === 'Parameter') {
            // either 'use gpu' or other parameter, either way invalid
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
