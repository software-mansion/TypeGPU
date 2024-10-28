import { entries, filter, fromEntries, groupBy, map, pipe } from 'remeda';
import type { Example, ExampleMetadata } from './types';

function pathToExampleKey<T>(record: Record<string, T>): Record<string, T> {
  return pipe(
    record,
    entries(),
    map(
      ([path, value]) =>
        [
          pipe(
            path,
            (path) => path.replace(/^..\/..\/content\/examples\//, ''), // remove parent folder
            (path) => path.replace(/\/[^\/]*$/, ''),
            (path) => path.replace(/\//, '--'),
          ),
          value,
        ] as const,
    ),
    fromEntries(),
  );
}

const metaFiles: Record<string, ExampleMetadata> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/meta.json', {
    eager: true,
    import: 'default',
  }),
);

const tsFiles: Record<string, string> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/index.ts', {
    query: 'raw',
    eager: true,
    import: 'default',
  }),
);

const htmlFiles: Record<string, string> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/index.html', {
    query: 'raw',
    eager: true,
    import: 'default',
  }),
);

export const examples = pipe(
  metaFiles,
  entries(),
  map(
    ([key, value]) =>
      [
        key,
        {
          key,
          metadata: value,
          tsCode: tsFiles[key] ?? '',
          htmlCode: htmlFiles[key] ?? '',
        },
      ] satisfies [string, Example],
  ),
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
