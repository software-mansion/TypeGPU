import { $labelForward } from './shared/symbols.ts';

interface MetaData {
  name: string | undefined;
}

declare global {
  var __TYPEGPU_META__: WeakMap<object, MetaData>;
}

function isObject(value: unknown): value is object {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isForwarded(value: object): value is { [$labelForward]: object } {
  if (!($labelForward in value)) {
    return false;
  }
  return isObject(value[$labelForward]);
}

export function getName(definition: unknown): string | undefined {
  if (!isObject(definition)) {
    return undefined;
  }
  if (isForwarded(definition)) {
    return getName(definition[$labelForward]);
  }
  return globalThis.__TYPEGPU_META__?.get(definition)?.name;
}

export function setName(definition: object, name: string): void {
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

/**
 * Can be assigned a name. Not to be confused with
 * being able to HAVE a name.
 * The `$name` function should use `setName` to rename the object itself,
 * or the object `$labelForward` symbol points to if applicable.
 */
export interface TgpuNamable {
  $name(label?: string | undefined): this;
}
export function isNamable(value: unknown): value is TgpuNamable {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    '$name' in value
  );
}
