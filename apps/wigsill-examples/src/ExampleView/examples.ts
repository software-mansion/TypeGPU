const rawExamples: Record<string, string> = import.meta.glob(
  '../examples/**/*.js',
  {
    query: 'raw',
    eager: true,
    import: 'default',
  },
);

import { mapKeys, mapValues, pipe } from 'remeda';
import { parseExampleCode } from './parseExampleCode';

export const examples = pipe(
  rawExamples,
  mapKeys((key) => {
    return key.replace('^../examples/', '');
  }),
  mapValues(parseExampleCode),
);
