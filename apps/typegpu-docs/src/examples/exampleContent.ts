import pathe from 'pathe';
import * as R from 'remeda';
import { atom } from 'jotai';
import type {
  Example,
  ExampleMetadata,
  ExampleSrcFile,
  ThumbnailPair,
} from '../utils/examples/types.ts';

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

function pathToExampleKey(path: string): string {
  return R.pipe(
    path,
    (p) => pathe.relative('./', p), // removing parent folder
    (p) => p.split('/'), // splitting into segments
    ([category, name]) => `${category}--${name}`,
  );
}

function globToExampleFiles(
  record: Record<string, () => Promise<string>>,
): Record<
  string,
  ({ exampleKey: string; file: () => Promise<ExampleSrcFile> })[]
> {
  return R.pipe(
    record,
    R.mapValues((content, key) => {
      const pathRelToExamples = pathe.relative('./', key);
      const categoryDir = pathRelToExamples.split('/')[0];
      const exampleDir = pathRelToExamples.split('/')[1];
      const examplePath = pathe.join(categoryDir, exampleDir);
      const exampleKey = pathToExampleKey(key);

      return {
        exampleKey,
        file: async () => ({
          exampleKey,
          path: pathe.relative(examplePath, key),
          content: await content(),
        }),
      };
    }),
    R.values(),
    R.groupBy(R.prop('exampleKey')),
  );
}

const metaFiles = R.pipe(
  import.meta.glob('./**/meta.json', {
    eager: true,
    import: 'default',
  }) as Record<string, ExampleMetadata>,
  R.mapKeys(pathToExampleKey),
);

const readonlyTsFiles = R.pipe(
  import.meta.glob<string>('./**/*.ts', {
    query: 'raw',
    import: 'default',
  }),
  globToExampleFiles,
);

const tsFilesImportFunctions = R.pipe(
  import.meta.glob('./**/index.ts'),
  R.mapKeys(pathToExampleKey),
);

const htmlFiles = R.pipe(
  import.meta.glob<string>('./**/index.html', {
    query: 'raw',
    import: 'default',
  }),
  globToExampleFiles,
);

const thumbnailFiles = R.pipe(
  import.meta.glob<string | [string, string]>('./**/thumbnail.png', {
    eager: true,
    import: 'default',
    query: 'w=512;1024',
  }),
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
  R.mapValues((value, key) =>
    ({
      key,
      metadata: value,
      contentAtom: atom(async () => {
        const [htmlFile, ...tsFiles] = await Promise.all([
          htmlFiles[key]?.[0].file(),
          ...readonlyTsFiles[key].map((file) => file.file()),
        ]);

        return {
          htmlFile,
          tsFiles,
        };
      }),
      tsImport: () => noCacheImport(tsFilesImportFunctions[key]),
      thumbnails: thumbnailFiles[key],
    }) satisfies Example
  ),
);

export const examplesByCategory = R.groupBy(
  Object.values(examples),
  (example) => example.metadata.category,
);

export const PLAYGROUND_KEY = 'playground__';
