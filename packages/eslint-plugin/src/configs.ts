import type { TSESLint } from '@typescript-eslint/utils';
import type { RawRules } from './plugin.ts';

type Rules = Record<
  `typegpu/${keyof RawRules}`,
  TSESLint.FlatConfig.RuleEntry
>;

export const recommendedRules: Rules = {
  'typegpu/integer-division': 'warn',
};
