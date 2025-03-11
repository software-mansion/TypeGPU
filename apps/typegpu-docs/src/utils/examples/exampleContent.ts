import { entries, filter, fromEntries, groupBy, map, pipe } from 'remeda';
import type { Example, ExampleMetadata } from './types';

function pathPipe(path: string): string {
  return pipe(
    path,
    (p) => p.replace(/^..\/..\/content\/examples\//, ''), // removing parent folder
    (p) => p.replace(/\/[^\/]*$/, ''), // removing leaf file names (e.g. meta.json, index.ts)
    (p) => p.replace(/\//, '--'), // replacing path separators with '--'
  );
}

function pathToExampleKey<T>(record: Record<string, T>): Record<string, T> {
  return pipe(
    record,
    entries(),
    map(([path, value]) => [pathPipe(path), value] as const),
    fromEntries(),
  );
}

function pathToExampleFilesMap<T>(
  record: Record<string, T>,
): Record<string, Record<string, T>> {
  const groups: Record<string, Record<string, T>> = {};

  for (const [path, value] of Object.entries(record)) {
    const groupKey = pathPipe(path);

    const fileNameMatch = path.match(/\/([^\/]+\.ts)$/);
    const fileName = fileNameMatch ? fileNameMatch[1] : path;

    if (!groups[groupKey]) {
      groups[groupKey] = {};
    }
    groups[groupKey][fileName] = value;
  }
  return groups;
}

function pathToExampleFilesToImportMap(
  record: Record<string, () => Promise<unknown>>,
): Record<string, Record<string, () => Promise<unknown>>> {
  const groups: Record<string, Record<string, () => Promise<unknown>>> = {};

  for (const [filePath, dynamicImport] of Object.entries(record)) {
    const groupKey = pathPipe(filePath);
    const fileNameMatch = filePath.match(/\/([^\/]+\.ts)$/);
    const fileName = fileNameMatch ? fileNameMatch[1] : filePath;
    if (!groups[groupKey]) {
      groups[groupKey] = {};
    }
    groups[groupKey][fileName] = dynamicImport;
  }

  return groups;
}

const metaFiles: Record<string, ExampleMetadata> = pathToExampleKey(
  import.meta.glob('../../content/examples/**/meta.json', {
    eager: true,
    import: 'default',
  }),
);

const readonlyTsFiles: Record<
  string,
  Record<string, string>
> = pathToExampleFilesMap(
  import.meta.glob('../../content/examples/**/*.ts', {
    query: 'raw',
    eager: true,
    import: 'default',
  }),
);

const tsFilesImportFunctions: Record<
  string,
  Record<string, () => Promise<unknown>>
> = pathToExampleFilesToImportMap(
  import.meta.glob('../../content/examples/**/*.ts'),
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
          tsCodes: readonlyTsFiles[key] ?? {},
          tsImports: tsFilesImportFunctions[key] ?? {},
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
  filter(([_, example]) =>
    example.metadata.tags?.includes('camera')
      ? typeof MediaStreamTrackProcessor === 'undefined'
      : true,
  ),
  fromEntries(),
);

export const examplesByCategory = groupBy(
  Object.values(examples),
  (example) => example.metadata.category,
);

export const PLAYGROUND_KEY = 'playground__';
