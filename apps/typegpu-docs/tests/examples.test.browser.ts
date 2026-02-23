import { expect, test } from 'vitest';
import { examples as exampleRecord } from '../src/examples/exampleContent.ts';
import { server } from '@vitest/browser/context';
import * as Plot from '@observablehq/plot';
import type { INTERNAL_GlobalExt } from 'typegpu';
import { pipe } from 'remeda';

const globalExt = globalThis as INTERNAL_GlobalExt;

const testArtifactsDirectory = './tests/artifacts';
const { writeFile } = server.commands;

const examples = Object.values(exampleRecord);

globalExt.__TYPEGPU_MEASURE_PERF__ = true;

interface ExampleRuntime {
  onCleanup(): void;
}

/**
 * The amount of time after Vitest decides that the test
 * has gone rogue. Adjust as necessary.
 */
const timeout = 120 * 1000;

const iterations = 10;

test('executes examples', async () => {
  const exampleView = document.createElement('div');
  document.body.appendChild(exampleView);

  for (const example of examples) {
    for (let i = 0; i < iterations; ++i) {
      // Creating the appropriate markup for the example
      exampleView.innerHTML = example.htmlFile.content;

      // Executing the example
      const result = await example.tsImport();
      expect(result).toHaveProperty('onCleanup');

      // Waiting for the example to run a few frames
      await new Promise((r) => setTimeout(r, 200));

      // Cleaning up the example
      (result as ExampleRuntime).onCleanup();
    }
  }

  document.body.removeChild(exampleView);

  const resolutionMetrics = pipe(
    globalExt.__TYPEGPU_PERF_RECORDS__?.get('resolution') ?? [],
  );

  await writeFile(
    `${testArtifactsDirectory}/example-benchmark.json`,
    JSON.stringify(
      {
        resolutionMetrics,
      },
    ),
  );

  const resolveFigure = Plot.plot({
    title: 'Resolve duration / Code size',
    marks: [
      Plot.frame(),
      Plot.dot(resolutionMetrics, {
        x: { value: 'wgslSize', label: 'Resolved WGSL size (no. chars)' },
        y: { value: 'resolveDuration', label: 'Resolve duration (ms)' },
      }),
    ],
  }).outerHTML;

  const compileFigure = Plot.plot({
    title: 'Compile duration / Code size',
    marks: [
      Plot.frame(),
      Plot.dot(resolutionMetrics, {
        x: { value: 'wgslSize', label: 'Resolved WGSL size (no. chars)' },
        y: { value: 'compileDuration', label: 'Compile duration (ms)' },
      }),
    ],
  }).outerHTML;

  await writeFile(
    `${testArtifactsDirectory}/example-benchmark.html`,
    `<html><body><style>body { color: black; }</style>${resolveFigure}${compileFigure}</body></html>`,
  );
}, timeout);
