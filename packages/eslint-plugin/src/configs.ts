import type { TSESLint } from '@typescript-eslint/utils';
import { integerDivision } from './rules/integerDivision.ts';
import { unwrappedPojos } from './rules/unwrappedPojos.ts';
import { invalidAssignment } from './rules/invalidAssignment.ts';

export const rules = {
  'integer-division': integerDivision,
  'unwrapped-pojo': unwrappedPojos,
  'invalid-assignment': invalidAssignment,
} as const;

type Rules = Record<
  `typegpu/${keyof typeof rules}`,
  TSESLint.FlatConfig.RuleEntry
>;

export const recommendedRules: Rules = {
  'typegpu/integer-division': 'warn',
  'typegpu/unwrapped-pojo': 'warn',
  'typegpu/invalid-assignment': 'warn',
};

export const allRules: Rules = {
  'typegpu/integer-division': 'error',
  'typegpu/unwrapped-pojo': 'error',
  'typegpu/invalid-assignment': 'error',
};
