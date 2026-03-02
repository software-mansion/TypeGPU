import { ASTUtils, type TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../ruleCreator.ts';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { RuleContext } from '@typescript-eslint/utils/ts-eslint';

export const invalidAssignment = createRule({
  name: 'invalid-assignment',
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
        checkAssignment(context, node, enclosingFn, node.argument);
      },

      AssignmentExpression(node) {
        const enclosingFn = directives.getEnclosingTypegpuFunction();
        checkAssignment(context, node, enclosingFn, node.left);
      },
    };
  }),
});

function checkAssignment(
  context: Readonly<RuleContext<'parameterAssignment' | 'jsAssignment', []>>,
  node: TSESTree.Node,
  enclosingFn: TSESTree.Node | undefined,
  leftNode: TSESTree.Node,
) {
  if (!enclosingFn) {
    return;
  }

  // look for the definition of the variable we assign to
  let assignee = leftNode;
  while (assignee.type === 'MemberExpression') {
    if (
      assignee.property.type === 'Identifier' &&
      assignee.property.name === '$'
    ) {
      // a dollar was used so we assume this assignment is fine
      return;
    }
    assignee = assignee.object;
  }
  if (assignee.type !== 'Identifier') {
    return;
  }

  // look for a scope that contains at least one
  const variable = ASTUtils.findVariable(
    context.sourceCode.getScope(assignee),
    assignee.name,
  );

  // TODO: handle variables with no defs (globalThis, Math etc.)
  if (variable?.defs && variable.defs[0]) {
    // def[0] points to the correct scope
    // defs is an array because there may be multiple definitions with `var`
    const def = variable.defs[0];

    // we check if it was defined outside of current function by checking ranges
    if (
      def.node.range[1] < enclosingFn.range[0] ||
      enclosingFn.range[1] < def.node.range[0]
    ) {
      context.report({
        messageId: 'jsAssignment',
        node,
        data: { snippet: context.sourceCode.getText(leftNode) },
      });
    }

    if (def.type === 'Parameter') {
      // either 'use gpu' or other parameter, either way invalid
      context.report({
        messageId: 'parameterAssignment',
        node,
        data: { snippet: context.sourceCode.getText(leftNode) },
      });
    }
  }
}
