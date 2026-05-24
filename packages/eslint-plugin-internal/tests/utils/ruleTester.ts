import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';

// RuleTester relies on global hooks for tests.
// Vitest doesn't make the hooks available globally, so we need to bind them.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

export const ruleTester = new RuleTester();
