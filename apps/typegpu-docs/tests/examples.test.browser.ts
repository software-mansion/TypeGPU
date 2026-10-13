import { expect, test } from 'vitest';
import { examples as exampleRecord } from '../src/examples/exampleContent.ts';
import { server } from 'vitest/browser';
import * as Plot from '@observablehq/plot';
import type { INTERNAL_GlobalExt } from 'typegpu';
import { pipe } from 'remeda';
import { createStore } from 'jotai';

const globalExt = globalThis as INTERNAL_GlobalExt;

const testArtifactsDirectory = './tests/artifacts';
const { writeFile } = server.commands;

const examples = Object.values(exampleRecord);

globalExt.__TYPEGPU_MEASURE_PERF__ = true;

interface ExampleRuntime {
  onCleanup(): void;
}

const iterations = 10;

/** Time each example is left running before it is cleaned up. */
const settleTimeMs = 200;

/**
 * The amount of time after Vitest decides that the test
 * has gone rogue. Scales with the workload: every iteration waits `settleTimeMs`, and
 * the rest of the budget covers loading, running and cleaning up the example.
 */
const timeout = examples.length * iterations * (settleTimeMs + 1000);

/**
 * Examples are cleaned up while they still have async work in flight (e.g. a pending buffer
 * read or an inference run), which surfaces as unhandled rejections after `onCleanup()`.
 * They don't affect the measurements, so they are logged instead of failing the benchmark.
 */
const knownCleanupRejections = [
  /Buffer was unmapped before mapping was resolved/,
  /failed to call OrtRun\(\)/,
];

/** Rejections that are not known cleanup races. They fail the test once it finishes. */
const unexpectedRejections: string[] = [];

// Vitest stops reporting unhandled rejections as soon as a listener for them is registered,
// so everything that is not explicitly allowed above is collected here and asserted below.
window.addEventListener('unhandledrejection', (event) => {
  const message = String(event.reason?.message ?? event.reason);
  if (knownCleanupRejections.some((pattern) => pattern.test(message))) {
    event.preventDefault();
    console.warn(`Ignored rejection after example cleanup: ${message}`);
  } else {
    unexpectedRejections.push(message);
  }
});

test(
  'executes examples',
  async () => {
    const exampleView = document.createElement('div');
    document.body.appendChild(exampleView);
    const store = createStore();

    for (const example of examples) {
      for (let i = 0; i < iterations; ++i) {
        // Creating the appropriate markup for the example
        exampleView.innerHTML = (await store.get(example.sourceAtom)).htmlFile.content;

        // Executing the example
        const result = await example.tsImport();
        expect(result).toHaveProperty('onCleanup');

        // Waiting for the example to run a few frames
        await new Promise((r) => setTimeout(r, settleTimeMs));

        // Cleaning up the example
        (result as ExampleRuntime).onCleanup();
      }
    }

    document.body.removeChild(exampleView);

    const resolutionMetrics = pipe(globalExt.__TYPEGPU_PERF_RECORDS__?.get('resolution') ?? []);

    await writeFile(
      `${testArtifactsDirectory}/example-benchmark.json`,
      JSON.stringify({
        resolutionMetrics,
      }),
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

    // Let rejections caused by the last cleanup surface, then fail on the unexpected ones
    // (after the artifacts are written, so a long run doesn't lose its results).
    await new Promise((r) => setTimeout(r, settleTimeMs));
    expect(unexpectedRejections).toEqual([]);
  },
  timeout,
);
