import { expect, test } from 'vitest';
import { examples as exampleRecord } from '../src/utils/examples/exampleContent.ts';
import { server } from '@vitest/browser/context';
import * as Plot from '@observablehq/plot';
import { map, pipe } from 'remeda';

const { writeFile } = server.commands;

const examples = Object.values(exampleRecord);

// biome-ignore lint/suspicious/noExplicitAny: it exists, I swear
(globalThis as any).__TYPEGPU_MEASURE_PERF__ = true;

interface ExampleRuntime {
  onCleanup(): void;
}

/**
 * The amount of time after Vitest decides that the test
 * has gone rogue. Adjust as necessary.
 */
const timeout = 60 * 1000;

test('executes examples', async () => {
  const exampleView = document.createElement('div');
  document.body.appendChild(exampleView);

  for (const example of examples) {
    // Creating the appropriate markup for the example
    exampleView.innerHTML = example.htmlFile.content;

    // Executing the example
    const result = await example.tsImport();
    expect(result).toHaveProperty('onCleanup');

    // Waiting for the example to run a few frames
    await new Promise((r) => setTimeout(r, 500));

    // Cleaning up the example
    (result as ExampleRuntime).onCleanup();
  }

  document.body.removeChild(exampleView);

  const resolutionMetrics = pipe(
    performance.getEntriesByName('typegpu:resolution'),
    map((e) => ({ duration: e.duration, json: e.toJSON() })),
  );
  const compilationMetrics = performance.getEntriesByName(
    'typegpu:device.createShaderModule',
  );

  writeFile(
    './example-benchmark.json',
    JSON.stringify(
      {
        resolutionMetrics,
        compilationMetrics,
      },
    ),
  );

  const svg = Plot.plot({
    marks: [
      Plot.dot(resolutionMetrics.values(), {
        x: 'wgslSize',
        y: 'duration',
      }),
    ],
  }).outerHTML;

  writeFile(
    './example-benchmark.html',
    `<html><body><style>body { color: black; }</style>${svg}</body></html>`,
  );
}, timeout);
