import type { TSESLint } from '@typescript-eslint/utils';
import { integerDivision } from './rules/integerDivision.ts';
import { unwrappedPojos } from './rules/unwrappedPojos.ts';
import { math } from './rules/math.ts';
import { spreadOperator } from './rules/spreadOperator.ts';
import { uninitializedVariable } from './rules/uninitializedVariable.ts';

export const rules = {
  'integer-division': integerDivision,
  'unwrapped-pojo': unwrappedPojos,
  'uninitialized-variable': uninitializedVariable,
  'spread-operator': spreadOperator,
  'math': math,
} as const;

type Rules = Record<
  `typegpu/${keyof typeof rules}`,
  TSESLint.FlatConfig.RuleEntry
>;

export const recommendedRules: Rules = {
  'typegpu/integer-division': 'warn',
  'typegpu/unwrapped-pojo': 'warn',
  'typegpu/uninitialized-variable': 'warn',
  'typegpu/spread-operator': 'error',
  'typegpu/math': 'warn',
};

export const allRules: Rules = {
  'typegpu/integer-division': 'error',
  'typegpu/unwrapped-pojo': 'error',
  'typegpu/uninitialized-variable': 'error',
  'typegpu/spread-operator': 'error',
  'typegpu/math': 'error',
};
