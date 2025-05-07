interface MetaData {
  name: string | undefined;
}

declare global {
  var __TYPEGPU_META__: WeakMap<object, MetaData>;
}

export function getName(definition: object): string | undefined {
  return globalThis.__TYPEGPU_META__?.get(definition)?.name;
}

export function setName(definition: object, name: string | undefined): void {
  const map = globalThis.__TYPEGPU_META__ ??= new WeakMap();
  map.set(definition, { ...map.get(definition), name });
}

export function setNameIfMissing(definition: object, name: string): void {
  if (getName(definition) === undefined) {
    setName(definition, name);
  }
}
