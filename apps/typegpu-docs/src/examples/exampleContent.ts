// oxlint-disable typescript/no-unnecessary-type-assertion -- import.meta.glob is inferred incorrectly by oxlint
import pathe from 'pathe';
import * as R from 'remeda';
import { atom } from 'jotai';
import type {
  Example,
  ExampleCommonFile,
  ExampleMetadata,
  ExampleSource,
  ExampleSrcFile,
  PendingExampleSrcFile,
  ThumbnailPair,
} from '../utils/examples/types.ts';
import { pathToExampleKey } from './pathToExampleKey.ts';
import { metaContent, tsContentLazy, tsnotoverContentLazy } from './importers.ts';
import { usedApis } from './usedApis.ts';

function extractUrlFromViteImport(importFn: () => void): [URL | undefined, boolean] {
  const filePath = String(importFn);
  const match = filePath.match(/\(\)\s*=>\s*import\(["`']([^"`']+)["`']\)/);

  if (match?.[1]) {
    const isRelative = match[1].startsWith('./');
    return [new URL(match[1], window.location.origin), isRelative];
  }

  return [undefined, false];
}

function noCacheImport<T>(importFn: () => Promise<T>): Promise<T> {
  const [url, isRelative] = extractUrlFromViteImport(importFn);

  if (!url) {
    throw new Error(`Could not no-cache-import using ${importFn}`);
  }

  url.searchParams.append('update', Date.now().toString());
  return import(/* @vite-ignore */ `${isRelative ? '.' : ''}${url.pathname}${url.search}`);
}

function pathToRelativePath(path: string): string {
  const pathRelToExamples = pathe.relative('./', path);
  const categoryDir = pathRelToExamples.split('/')[0];
  const exampleDir = pathRelToExamples.split('/')[1];
  const examplePath = pathe.join(categoryDir, exampleDir);

  return pathe.relative(examplePath, path);
}

function withCoolFactorFallback(metadata: ExampleMetadata): ExampleMetadata {
  return Number.isFinite(metadata.coolFactor) ? metadata : { ...metadata, coolFactor: 0 };
}

const metaFiles = R.pipe(
  metaContent,
  R.mapKeys(pathToExampleKey),
  R.mapValues(withCoolFactorFallback),
);

function replaceExt(key: string, newExt: string) {
  return `${key.substring(0, key.length - pathe.extname(key).length)}${newExt}`;
}

const exampleTsFiles = R.pipe(
  tsContentLazy,
  R.entries(),
  R.filter(([key]) => !key.includes('.tsnotover.')),
  R.map(
    ([key, getContent]): PendingExampleSrcFile => ({
      exampleKey: pathToExampleKey(key),
      path: pathToRelativePath(key),
      getContent,
      getTsnotoverContent: tsnotoverContentLazy[replaceExt(key, `.tsnotover${pathe.extname(key)}`)],
    }),
  ),
  R.groupBy(R.prop('exampleKey')),
);

const tsFilesImportFunctions = R.pipe(
  import.meta.glob(['./*/*/index.ts', './*/*/index.tsx']) as Record<string, () => Promise<unknown>>,
  R.mapKeys(pathToExampleKey),
);

const htmlFiles = R.pipe(
  import.meta.glob('./**/index.html', {
    query: 'raw',
    import: 'default',
  }) as Record<string, () => Promise<string>>,
  R.entries(),
  R.map(
    ([key, getContent]): PendingExampleSrcFile => ({
      exampleKey: pathToExampleKey(key),
      path: pathToRelativePath(key),
      getContent,
    }),
  ),
  R.groupBy(R.prop('exampleKey')),
);

const thumbnailFiles = R.pipe(
  import.meta.glob('./**/thumbnail.png', {
    eager: true,
    import: 'default',
    query: 'w=512;1024',
  }) as Record<string, string | [string, string]>,
  R.mapKeys(pathToExampleKey),
  R.mapValues((value, key): ThumbnailPair => {
    if (typeof value === 'string') {
      throw new Error(
        `Thumbnail for example "${key}" is too small (required width is at least 513 pixels).`,
      );
    }
    return { small: value[0], large: value[1] };
  }),
);

async function resolveExampleSrcFile(pending: PendingExampleSrcFile): Promise<ExampleSrcFile> {
  const [content, tsnotoverContent] = await Promise.all([
    pending.getContent(),
    pending.getTsnotoverContent?.(),
  ]);

  return {
    exampleKey: pending.exampleKey,
    path: pending.path,
    content,
    tsnotoverContent,
  };
}

export const examples = R.pipe(
  metaFiles,
  R.mapValues((value, key) => {
    const apisUsedInTheExample = usedApis[key];

    if (!apisUsedInTheExample) {
      console.warn(`No APIs detected in example '${key}'`);
    }

    return {
      key,
      metadata: value,
      sourceAtom: atom(async (): Promise<ExampleSource> => {
        // Prewarming the promises
        const tsFilePromises = exampleTsFiles[key].map(resolveExampleSrcFile);
        const htmlFilePromise = resolveExampleSrcFile(htmlFiles[key]?.[0]);

        const tsFiles = await Promise.all(tsFilePromises);
        const htmlFile = await htmlFilePromise;

        return {
          tsFiles,
          htmlFile,
        };
      }),
      tsImport: () => noCacheImport(tsFilesImportFunctions[key]),
      thumbnails: thumbnailFiles[key],
      usedApis: [...(apisUsedInTheExample ?? [])],
    } satisfies Example;
  }),
);

export const examplesByCategory = R.groupBy(
  Object.values(examples),
  (example) => example.metadata.category,
);

export const common = R.pipe(
  import.meta.glob('./common/*.ts', {
    query: 'raw',
    eager: true,
    import: 'default',
  }) as Record<string, string>,
  R.mapValues(
    (content: string, key: string): ExampleCommonFile => ({
      common: true,
      path: pathe.basename(key),
      content,
    }),
  ),
  R.values(),
);

export const PLAYGROUND_KEY = 'playground__';
