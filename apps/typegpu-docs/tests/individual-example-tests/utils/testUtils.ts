import { flattenControls } from '../../../src/examples/common/flattenControls.ts';
import type { ExampleControlOptions } from '../../../src/utils/examples/exampleRunner.ts';

export function getExampleURLs(
  category: string,
  name: string,
): {
  html: string;
  ts: string;
} {
  return {
    html: `../../../src/examples/${category}/${name}/index.html?raw`,
    ts: `../../../src/examples/${category}/${name}/index`,
  };
}

export function createDeepNoopProxy<T extends object>(
  target: T,
  accessedProperties = new Set<PropertyKey>(),
): T {
  return new Proxy(target, {
    get(_obj, prop, _receiver) {
      accessedProperties.add(prop);

      if (prop in target) {
        return Reflect.get(target, prop);
      }

      return () => createDeepNoopProxy({}, accessedProperties);
    },
    set() {
      return true; // No-op set
    },
    apply() {
      return createDeepNoopProxy({}, accessedProperties);
    },
  });
}

export type ControlTrigger = string | readonly string[];

export async function testExampleShaderGeneration(
  examplePath: string,
  controlTriggers: readonly ControlTrigger[] = [],
) {
  const example = await import(examplePath);
  const buttons = new Map<string, { onButtonClick: () => void }>();
  const controls: ExampleControlOptions = example.controls ?? {};
  for (const { path, value } of flattenControls(controls)) {
    if ('onButtonClick' in value) {
      buttons.set(JSON.stringify(path), value);
    }
  }

  for (const trigger of controlTriggers) {
    const path = typeof trigger === 'string' ? [trigger] : trigger;
    const button = buttons.get(JSON.stringify(path));
    if (button) {
      try {
        button.onButtonClick();
      } catch {}
    }
  }

  return example;
}

export function extractShaderCodes(
  // oxlint-disable-next-line typescript/no-explicit-any -- we testing here
  device: any,
  expectedCalls?: number,
): string {
  const calls = device.mock.createShaderModule.mock.calls as unknown as Array<
    [GPUShaderModuleDescriptor, { label?: string }]
  >;
  if (expectedCalls !== undefined && calls.length !== expectedCalls) {
    throw new Error(
      `Expected ${expectedCalls} shader module creation calls, but got ${calls.length}.`,
    );
  }
  return calls.map(([descriptor]) => descriptor.code).join('\n\n');
}

export async function waitForExpectedCalls(
  // oxlint-disable-next-line typescript/no-explicit-any -- it's a mock
  device: any,
  expectedCalls: number,
): Promise<void> {
  const maxWaitTime = 1000;
  const pollInterval = 10;
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    const currentCalls = device.mock?.createShaderModule?.mock?.calls?.length || 0;
    if (currentCalls >= expectedCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  console.warn(
    `Timeout waiting for ${expectedCalls} shader calls, got ${
      device.mock?.createShaderModule?.mock?.calls?.length || 0
    }`,
  );
}
