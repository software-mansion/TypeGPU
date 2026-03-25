import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator(
  // TODO: docs for lint rules
  () => `https://docs.swmansion.com/TypeGPU/getting-started/`,
);
