import pathe from 'pathe';
import * as R from 'remeda';
import type {
  Example,
  ExampleMetadata,
  ExampleSrcFile,
  ThumbnailPair,
} from './types.ts';

function extractUrlFromViteImport(
  importFn: () => void,
): [URL | undefined, boolean] {
  const filePath = String(importFn);
  const match = filePath.match(/\(\)\s*=>\s*import\("([^"]+)"\)/);

  if (match?.[1]) {
    const isRelative = match[1].startsWith('./');
    return [new URL(match[1], window.location.origin), isRelative];
  }

  return [undefined, false];
}

function noCacheImport<T>(
  importFn: () => Promise<T>,
): Promise<T> {
  const [url, isRelative] = extractUrlFromViteImport(importFn);

  if (!url) {
    throw new Error(`Could not no-cache-import using ${importFn}`);
  }

  url.searchParams.append('update', Date.now().toString());
  return import(
    /* @vite-ignore */ `${isRelative ? '.' : ''}${url.pathname}${url.search}`
  );
}

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

const thumbnailFiles = R.pipe(
  import.meta.glob('../../content/examples/**/thumbnail.png', {
    eager: true,
    import: 'default',
    query: 'w=512;1024',
  }) as Record<string, string | [string, string]>,
  R.mapKeys(pathToExampleKey),
  R.mapValues((
    value,
    key,
  ): ThumbnailPair => {
    if (typeof value === 'string') {
      throw new Error(
        `Thumbnail for example "${key}" is too small (required width is at least 513 pixels).`,
      );
    }
    return { small: value[0], large: value[1] };
  }),
);

export const examples = R.pipe(
  metaFiles,
  R.mapValues(
    (value, key) =>
      ({
        key,
        metadata: value,
        tsFiles: readonlyTsFiles[key] ?? [],
        tsImport: () => noCacheImport(tsFilesImportFunctions[key]),
        htmlFile: htmlFiles[key]?.[0] ?? '',
        thumbnails: thumbnailFiles[key],
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
