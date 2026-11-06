import { describe, vi } from 'vitest';
import { normalizedFormatCases } from './normalizedFormatCases.ts';

// gets hoisted before imports
vi.mock('../../src/data/compiledIO.ts', () => ({
  getCompiledWriter: () => undefined,
  buildWriter: () => '',
}));

describe('normalized formats (fallback writers)', () => {
  normalizedFormatCases();
});
