import { createRule } from '../ruleCreator.ts';

export const unwrappedPojos = createRule({
  name: 'AAA',
  meta: {
    type: 'problem',
    docs: {
      description: `Always wrap plain old javascript objects with schemas.`,
    },
    messages: {
      unwrappedPojo: '{{snippet}}',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {};
  },
});
