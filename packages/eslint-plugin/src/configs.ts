import type { TSESLint } from '@typescript-eslint/utils';
import { noIntegerDivision } from './rules/noIntegerDivision.ts';
import { noUnwrappedObjects } from './rules/noUnwrappedObjects.ts';
import { noMath } from './rules/noMath.ts';
import { noUninitializedVariables } from './rules/noUninitializedVariables.ts';

export const rules = {
  'no-integer-division': noIntegerDivision,
  'no-unwrapped-objects': noUnwrappedObjects,
  'no-uninitialized-variables': noUninitializedVariables,
  'no-math': noMath,
} as const;

type Rules = Record<`typegpu/${keyof typeof rules}`, TSESLint.FlatConfig.RuleEntry>;

export const recommendedRules: Rules = {
  'typegpu/no-integer-division': 'warn',
  'typegpu/no-unwrapped-objects': 'error',
  'typegpu/no-uninitialized-variables': 'error',
  'typegpu/no-math': 'warn',
};

export const allRules: Rules = {
  'typegpu/no-integer-division': 'error',
  'typegpu/no-unwrapped-objects': 'error',
  'typegpu/no-uninitialized-variables': 'error',
  'typegpu/no-math': 'error',
};
