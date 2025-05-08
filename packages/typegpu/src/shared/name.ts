import { $labelForward } from './symbols.ts';

interface MetaData {
  name: string | undefined;
}

declare global {
  var __TYPEGPU_META__: WeakMap<object, MetaData>;
}

function isForwarded(value: object): value is { [$labelForward]: object } {
  if (!($labelForward in value)) {
    return false;
  }
  const maybeObj = value[$labelForward];
  if (maybeObj === null || maybeObj === undefined) {
    return false;
  }
  return typeof maybeObj === 'object' || typeof maybeObj === 'function';
}

export function getName(definition: object): string | undefined {
  if (isForwarded(definition)) {
    return getName(definition[$labelForward]);
  }
  return globalThis.__TYPEGPU_META__?.get(definition)?.name;
}

export function setName(definition: object, name: string | undefined): void {
  if (isForwarded(definition)) {
    return setName(definition[$labelForward], name);
  }
  const map = globalThis.__TYPEGPU_META__ ??= new WeakMap();
  map.set(definition, { ...map.get(definition), name });
}

export function setNameIfMissing(definition: object, name: string): void {
  if (getName(definition) === undefined) {
    setName(definition, name);
  }
}

// AAA move this to other file
// AAA test for $name?
// AAA disallow undefined
// AAA narrow the types of { [$labelForward]: object }
// AAA this._membership.key
