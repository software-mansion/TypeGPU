import pathe from 'pathe';
import * as R from 'remeda';
import type { Example, ExampleMetadata, ExampleSrcFile } from './types.ts';

const contentExamplesPath = '../../content/examples/';

function pathToExampleKey(path: string): string {
  return R.pipe(
    path,
    (p) => pathe.relative(contentExamplesPath, p), // removing parent folder
    (p) => p.split('/'), // splitting into segments
    ([category, name]) => `${category}--${name}`,
  );
}

function globToExampleFiles(
  record: Record<string, string>,
): Record<string, ExampleSrcFile[]> {
  return R.pipe(
    record,
    R.mapValues((content, key): ExampleSrcFile => {
      const pathRelToExamples = pathe.relative(contentExamplesPath, key);
      const categoryDir = pathRelToExamples.split('/')[0];
      const exampleDir = pathRelToExamples.split('/')[1];
      const examplePath = pathe.join(
        contentExamplesPath,
        categoryDir,
        exampleDir,
      );

      return {
        exampleKey: pathToExampleKey(key),
        path: pathe.relative(examplePath, key),
        content,
      };
    }),
    R.values(),
    R.groupBy(R.prop('exampleKey')),
  );
}

const metaFiles = R.pipe(
  import.meta.glob('../../content/examples/**/meta.json', {
    eager: true,
    import: 'default',
  }) as Record<string, ExampleMetadata>,
  R.mapKeys(pathToExampleKey),
);

const readonlyTsFiles = R.pipe(
  import.meta.glob('../../content/examples/**/*.ts', {
    query: 'raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  globToExampleFiles,
);

const tsFilesImportFunctions = R.pipe(
  import.meta.glob('../../content/examples/**/index.ts') as Record<
    string,
    () => Promise<unknown>
  >,
  R.mapKeys(pathToExampleKey),
);

const htmlFiles = R.pipe(
  import.meta.glob('../../content/examples/**/index.html', {
    query: 'raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  globToExampleFiles,
);

export const examples = R.pipe(
  metaFiles,
  R.mapValues(
    (value, key) =>
      ({
        key,
        metadata: value,
        tsFiles: readonlyTsFiles[key] ?? [],
        tsImport: tsFilesImportFunctions[key],
        htmlFile: htmlFiles[key][0] ?? '',
      }) satisfies Example,
  ),
);

export const examplesStable = R.pipe(
  examples,
  R.entries(),
  R.filter(([_, example]) => !example.metadata.tags?.includes('experimental')),
  R.filter(([_, example]) =>
    example.metadata.tags?.includes('camera')
      ? typeof MediaStreamTrackProcessor === 'undefined'
      : true
  ),
  R.fromEntries(),
);

export const examplesByCategory = R.groupBy(
  Object.values(examples),
  (example) => example.metadata.category,
);

export const PLAYGROUND_KEY = 'playground__';
