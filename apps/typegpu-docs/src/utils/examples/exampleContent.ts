import { entries, filter, fromEntries, groupBy, map, pipe } from 'remeda';
import type { Example, ExampleMetadata, Module } from './types';

function pathToExampleKey<T>(record: Record<string, T>): Record<string, T> {
  return pipe(
    record,
    entries(),
    map(
      ([path, value]) =>
        [
          pipe(
            path,
            (path) => path.replace(/^..\/..\/content\/examples\//, ''), // removing parent folder
            (path) => path.replace(/\/[^\/]*$/, ''), // removing leaf file names (e.g. meta.json, index.ts)
            (path) => path.replace(/\//, '--'), // replacing path separators with '--'
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

const readonlyTsFiles: Record<string, string> = pathToExampleKey(
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

const execTsFiles: Record<string, Module> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/index.ts', {
    query: { tgpu: true },
    eager: true,
  }),
);

function moduleToString(module?: Module) {
  return module ? `${module.default}` : '';
}

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
          tsCode: readonlyTsFiles[key] ?? '',
          htmlCode: htmlFiles[key] ?? '',
          execTsCode: moduleToString(execTsFiles[key]),
        },
      ] satisfies [string, Example],
  ),
  fromEntries(),
);

export const examplesStable = pipe(
  examples,
  entries(),
  filter(([_, example]) => !example.metadata.tags?.includes('experimental')),
  filter(([_, example]) =>
    example.metadata.tags?.includes('camera')
      ? MediaStreamTrackProcessor === undefined
      : true,
  ),
  fromEntries(),
);

export const examplesByCategory = groupBy(
  Object.values(examples),
  (example) => example.metadata.category,
);

export const PLAYGROUND_KEY = 'playground__';
