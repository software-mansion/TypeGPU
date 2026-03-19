import type { TSESLint } from '@typescript-eslint/utils';
import { integerDivision } from './rules/integerDivision.ts';
import { unwrappedPojos } from './rules/unwrappedPojos.ts';
import { noUnsupportedSyntax } from './rules/noUnsupportedSyntax.ts';

export const rules = {
  'integer-division': integerDivision,
  'unwrapped-pojo': unwrappedPojos,
  'no-unsupported-syntax': noUnsupportedSyntax,
} as const;

type Rules = Record<`typegpu/${keyof typeof rules}`, TSESLint.FlatConfig.RuleEntry>;

export const recommendedRules: Rules = {
  'typegpu/integer-division': 'warn',
  'typegpu/unwrapped-pojo': 'warn',
  'typegpu/no-unsupported-syntax': 'warn',
};

export const allRules: Rules = {
  'typegpu/integer-division': 'error',
  'typegpu/unwrapped-pojo': 'error',
  'typegpu/no-unsupported-syntax': 'error',
};
