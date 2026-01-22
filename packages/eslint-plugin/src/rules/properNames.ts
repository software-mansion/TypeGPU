import { createRule } from "./ruleCreator.ts";

export const properNames = createRule({
  name: "proper-names",
  meta: {
    type: "suggestion",
    docs: { description: 'Enforce that no variables are named "AAA".' },
    messages: { badName: "Variable '{{name}}' has invalid name." },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") {
          return;
        }

        const name = node.id.name;

        if (name === "AAA") {
          context.report({
            node: node.id,
            messageId: "badName",
            data: { name },
          });
        }
      },
    };
  },
});
