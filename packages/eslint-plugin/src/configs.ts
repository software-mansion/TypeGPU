import type { TSESLint } from '@typescript-eslint/utils';
import { integerDivision } from './rules/integerDivision.ts';

export const rules = {
  'integer-division': integerDivision,
} as const;

type Rules = Record<
  `typegpu/${keyof typeof rules}`,
  TSESLint.FlatConfig.RuleEntry
>;

export const recommendedRules: Rules = {
  'typegpu/integer-division': 'warn',
};

export const allRules: Rules = {
  'typegpu/integer-division': 'error',
};
