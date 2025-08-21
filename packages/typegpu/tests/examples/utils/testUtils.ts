export function getExampleURLs(category: string, name: string): {
  html: string;
  ts: string;
} {
  return {
    html:
      `../../../../../apps/typegpu-docs/src/content/examples/${category}/${name}/index.html?raw`,
    ts:
      `../../../../../apps/typegpu-docs/src/content/examples/${category}/${name}/index.ts`,
  };
}

export function createDeepNoopProxy<T extends object>(
  target: T,
  accessedProperties = new Set<PropertyKey>(),
): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      accessedProperties.add(prop);

      // biome-ignore lint/suspicious/noExplicitAny: we testing here
      return () => createDeepNoopProxy({} as any, accessedProperties);
    },
    set() {
      return true; // No-op set
    },
    apply() {
      // biome-ignore lint/suspicious/noExplicitAny: we testing here
      return createDeepNoopProxy({} as any, accessedProperties);
    },
  }) as T;
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

// biome-ignore lint/suspicious/noExplicitAny: we testing here
export function extractShaderCodes(device: any): string {
  const calls = device.mock.createShaderModule.mock.calls as unknown as Array<
    [GPUShaderModuleDescriptor, { label?: string }]
  >;
  return calls.map(([descriptor]) => descriptor.code).join('\n\n');
}

export async function waitForAsyncOperations(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
