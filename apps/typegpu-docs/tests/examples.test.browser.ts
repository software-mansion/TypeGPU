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

/** Unhandled rejections. They fail the test once it finishes. */
const unexpectedRejections: string[] = [];

// Vitest stops reporting unhandled rejections as soon as a listener for them is registered,
// so they are collected here and asserted below.
window.addEventListener('unhandledrejection', (event) => {
  // keep the top of the stack so the failure says where it comes from
  unexpectedRejections.push(
    String(event.reason?.stack ?? event.reason?.message ?? event.reason)
      .split('\n')
      .slice(0, 6)
      .join('\n'),
  );
});

test(
  'executes examples',
  async () => {
    const exampleView = document.createElement('div');
    document.body.appendChild(exampleView);
    const store = createStore();

    for (const example of Object.values(exampleRecord)) {
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
