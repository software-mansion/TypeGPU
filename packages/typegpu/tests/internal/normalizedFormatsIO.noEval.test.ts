import { afterAll, beforeAll, describe } from 'vitest';
import { setGlobalJITPreference } from 'typegpu';
import { normalizedFormatCases } from './normalizedFormatCases.ts';

beforeAll(() => {
  setGlobalJITPreference('disabled');
});

afterAll(() => {
  setGlobalJITPreference('auto');
});

describe('normalized formats (fallback writers)', () => {
  normalizedFormatCases();
});
