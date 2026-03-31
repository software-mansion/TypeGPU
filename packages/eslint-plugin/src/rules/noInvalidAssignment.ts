import { ASTUtils, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../ruleCreator.ts';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import type { RuleContext } from '@typescript-eslint/utils/ts-eslint';

export const noInvalidAssignment = createRule({
  name: 'no-invalid-assignment',
  meta: {
    type: 'problem',
    docs: {
      description: `Avoid assignments that will not generate valid WGSL.`,
    },
    messages: {
      parameterAssignment:
        "Cannot assign to '{{snippet}}' since WGSL parameters are immutable. If you're using d.ref, please either use '.$' or disable this rule.",
      jsAssignment:
        "Cannot assign to '{{snippet}}' since it is a JS variable defined outside of the current TypeGPU function's scope. Use buffers, workgroup variables or local variables instead.",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      UpdateExpression(node) {
        const enclosingFn = directives.getEnclosingTypegpuFunction();
        validateAssignment(context, node, enclosingFn, node.argument);
      },

      AssignmentExpression(node) {
        const enclosingFn = directives.getEnclosingTypegpuFunction();
        validateAssignment(context, node, enclosingFn, node.left);
      },
    };
  }),
});

function validateAssignment(
  context: Readonly<RuleContext<'parameterAssignment' | 'jsAssignment', []>>,
  node: TSESTree.Node,
  enclosingFn: TSESTree.Node | undefined,
  leftNode: TSESTree.Node,
) {
  if (!enclosingFn) {
    return;
  }

  // follow the member expression chain
  let assignee = leftNode;
  while (assignee.type === 'MemberExpression') {
    if (assignee.property.type === 'Identifier' && assignee.property.name === '$') {
      // a dollar was used so we assume this assignment is fine
      return;
    }
    assignee = assignee.object;
  }
  if (assignee.type !== 'Identifier') {
    return;
  }

  // look for a scope that defines the variable
  const variable = ASTUtils.findVariable(context.sourceCode.getScope(assignee), assignee);
  // defs is an array because there may be multiple definitions with `var`
  const def = variable?.defs[0];

  // check if variable is global or was defined outside of current function by checking ranges
  // NOTE: if the variable is an outer function parameter, then the enclosingFn range will be encompassed by node range
  if (
    !def ||
    (def && (def.node.range[0] < enclosingFn.range[0] || enclosingFn.range[1] < def.node.range[1]))
  ) {
    context.report({
      messageId: 'jsAssignment',
      node,
      data: { snippet: context.sourceCode.getText(leftNode) },
    });
    return;
  }

  if (def.type === 'Parameter') {
    context.report({
      messageId: 'parameterAssignment',
      node,
      data: { snippet: context.sourceCode.getText(leftNode) },
    });
  }
}
