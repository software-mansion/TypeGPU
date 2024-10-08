import {
  entries,
  filter,
  fromEntries,
  groupBy,
  isNonNull,
  map,
  pipe,
} from 'remeda';
import { parseExampleCode } from './parseExampleCode';
import type { Example } from './types';

const rawExamples: Record<string, string> = import.meta.glob(
  '../../content/examples/**/*.ts',
  {
    query: 'raw',
    eager: true,
    import: 'default',
  },
);

export const examples = pipe(
  rawExamples,
  entries(),
  map(([path, value]) => {
    const key = pipe(
      path,
      (path) => path.replace(/^..\/..\/content\/examples\//, ''), // remove parent folder
      (path) => path.replace(/.ts$/, ''), // remove extension
      (path) => path.replace(/\//, '--'), // / -> --
    );

    return [key, parseExampleCode(key, value)] as const;
  }),
  filter((pair): pair is [string, Example] => isNonNull(pair[1])),
  fromEntries(),
);

export const examplesStable = pipe(
  examples,
  entries(),
  filter(([_, example]) => !example.metadata.tags?.includes('experimental')),
  fromEntries(),
);

export const examplesByCategory = groupBy(
  Object.values(examples),
  (example) => example.metadata.category,
);

export const PLAYGROUND_KEY = 'playground__';
