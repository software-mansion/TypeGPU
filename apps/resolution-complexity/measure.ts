import type * as t from './types.ts';
import type { INTERNAL_GlobalExt } from 'packages/typegpu/src/shared/meta.ts';

const CONFIG = {
  iterationsPerExample: 1000,
  outputFile: './resolution-performance-results.json',
};

async function getReleases(): Promise<string[]> {
  console.log('Fetching available releases...');
  const response = await fetch('https://registry.npmjs.org/typegpu');
  if (!response.ok) {
    throw new Error('Failed to fetch releases of TypeGPU');
  }
  const data = await response.json();
  return Object.keys(data.versions);
}

async function measureResolutionComplexityOfRelease(
  release: string,
): Promise<t.releaseResult> {
  // biome-ignore lint/performance/noDelete: I need to clean globalThis
  delete (globalThis as INTERNAL_GlobalExt).__TYPEGPU_MEASURE_PERF__;

  try {
    const url = `https://esm.sh/typegpu@${release}`;
    await import(url);

    console.log(release, Object.keys(globalThis));

    if (!('__TYPEGPU_MEASURE_PERF__' in globalThis)) {
      return { release, examplesResults: [] };
    }

    const examplesResults: t.exampleResult[] = [{
      example: 'test',
      codeSizeBytes: 7,
      resolutionTimeMs: 77,
    }];

    return {
      release,
      examplesResults,
    };
  } catch (error) {
    console.log(`Failed to import typegpu@${release}.`);
  }

  return { release, examplesResults: [] };
}

async function measureResolutionComplexity(): Promise<
  Promise<t.releaseResult>[]
> {
  const releases = await getReleases();
  console.log(`Found ${releases.length} releases.`);

  return releases.map((release) => {
    return measureResolutionComplexityOfRelease(release);
  });
}

measureResolutionComplexity()
  .then((results) => Promise.all(results))
  .then(console.log);
