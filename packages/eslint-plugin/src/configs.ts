import type { TSESLint } from '@typescript-eslint/utils';
import { integerDivision } from './rules/integerDivision.ts';
import { unwrappedPojos } from './rules/unwrappedPojos.ts';

export const rules = {
  'integer-division': integerDivision,
  'unwrapped-pojo': unwrappedPojos,
} as const;

type Rules = Record<
  `typegpu/${keyof typeof rules}`,
  TSESLint.FlatConfig.RuleEntry
>;

export const recommendedRules: Rules = {
  'typegpu/integer-division': 'warn',
  'typegpu/unwrapped-pojo': 'warn',
};

export const allRules: Rules = {
  'typegpu/integer-division': 'error',
  'typegpu/unwrapped-pojo': 'error',
};
