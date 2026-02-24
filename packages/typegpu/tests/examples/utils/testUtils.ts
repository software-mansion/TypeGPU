export function getExampleURLs(category: string, name: string): {
  html: string;
  ts: string;
} {
  return {
    html:
      `../../../../../apps/typegpu-docs/src/examples/${category}/${name}/index.html?raw`,
    ts:
      `../../../../../apps/typegpu-docs/src/examples/${category}/${name}/index.ts`,
  };
}

export function createDeepNoopProxy<T extends object>(
  target: T,
  accessedProperties = new Set<PropertyKey>(),
): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      accessedProperties.add(prop);

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

export async function testExampleShaderGeneration(
  examplePath: string,
  controlTriggers: string[] = [],
) {
  const example = await import(examplePath);

  for (const trigger of controlTriggers) {
    const control = example.controls?.[trigger];
    if (control?.onButtonClick) {
      try {
        control.onButtonClick();
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
    console.warn(
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
    const currentCalls = device.mock?.createShaderModule?.mock?.calls?.length ||
      0;
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
