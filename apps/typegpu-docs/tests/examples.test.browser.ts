import { expect, test } from 'vitest';
import { examples as exampleRecord } from '../src/utils/examples/exampleContent.ts';

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

  console.log(performance.getEntriesByName('typegpu:resolution'));
  console.log(
    performance.getEntriesByName('typegpu:device.createShaderModule'),
  );

  document.body.removeChild(exampleView);
}, timeout);
