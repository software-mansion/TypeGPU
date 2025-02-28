import { entries, filter, fromEntries, groupBy, map, pipe } from 'remeda';
import type { Example, ExampleMetadata, Module } from './types';

function pathToExampleKey<T>(record: Record<string, T>): Record<string, T> {
  return pipe(
    record,
    entries(),
    map(([path, value]) => [
      pipe(
        path,
        (p) => p.replace(/^..\/..\/content\/examples\//, ''),
        (p) => p.replace(/\/[^\/]*$/, ''),
        (p) => p.replace(/\//, '--')
      ),
      value,
    ] as const),
    fromEntries()
  );
}


function pathToExampleFilesMap<T>(record: Record<string, T>): Record<string, Record<string, T>> {
  const groups: Record<string, Record<string, T>> = {};

  for (const [path, value] of Object.entries(record)) {
    const groupKey = pipe(
      path,
      (p) => p.replace(/^..\/..\/content\/examples\//, ''),
      (p) => p.replace(/\/[^\/]*$/, ''),
      (p) => p.replace(/\//, '--')
    );

    const fileNameMatch = path.match(/\/([^\/]+\.ts)$/);
    const fileName = fileNameMatch ? fileNameMatch[1] : path;

    if (!groups[groupKey]) {
      groups[groupKey] = {};
    }
    groups[groupKey][fileName] = value;
  }

  return groups;
}

const metaFiles: Record<string, ExampleMetadata> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/meta.json', {
    eager: true,
    import: 'default',
  })
);

const readonlyTsFiles: Record<string, Record<string, string>> = pathToExampleFilesMap(
  import.meta.glob('../../content/examples/**/*.ts', {
    query: 'raw',
    eager: true,
    import: 'default',
  })
);

const htmlFiles: Record<string, string> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/index.html', {
    query: 'raw',
    eager: true,
    import: 'default',
  })
);

const execTsFiles: Record<string, Module> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/index.ts', {
    query: { tgpu: true },
    eager: true,
  })
);

function moduleToString(module?: Module) {
  return module ? `${module.default}` : '';
}

export const examples = pipe(
  metaFiles,
  entries(),
  map(([key, value]) => [
    key,
    {
      key,
      metadata: value,
      tsCodes: readonlyTsFiles[key] ?? {},
      htmlCode: htmlFiles[key] ?? '',
      execTsCode: moduleToString(execTsFiles[key]),
    },
  ] satisfies [string, Example]),
  fromEntries()
);
console.log('examples', examples);

export const examplesStable = pipe(
  examples,
  entries(),
  filter(([_, example]) => !example.metadata.tags?.includes('experimental')),
  filter(([_, example]) =>
    example.metadata.tags?.includes('camera')
      ? typeof MediaStreamTrackProcessor === 'undefined'
      : true
  ),
  fromEntries()
);

export const examplesByCategory = groupBy(
  Object.values(examples),
  (example) => example.metadata.category
);

export const PLAYGROUND_KEY = 'playground__';
