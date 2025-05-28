import type { Block, FuncParameter } from 'tinyest';
import { $getNameForward } from './symbols.ts';

export interface MetaData {
  name?: string | undefined;
  ast?: {
    v: number;
    params: FuncParameter[];
    body: Block;
    externalNames: string[];
  } | undefined;
  externals?: Record<string, unknown> | undefined;
}

interface GlobalWithMeta {
  __TYPEGPU_META__: WeakMap<object, MetaData>;
}

function isForwarded(value: unknown): value is { [$getNameForward]: unknown } {
  return !!(value as { [$getNameForward]?: unknown })?.[$getNameForward];
}

export function getName(definition: unknown): string | undefined {
  if (isForwarded(definition)) {
    return getName(definition[$getNameForward]);
  }
  return getMetaData(definition)?.name;
}

export function setName(definition: object, name: string): void {
  setMetaData(definition, { name });
}

/**
 * Can be assigned a name. Not to be confused with
 * being able to HAVE a name.
 * The `$name` function should use `setName` to rename the object itself,
 * or rename the object `$getNameForward` symbol points to instead if applicable.
 */
export interface TgpuNamable {
  $name(label: string): this;
}

export function isNamable(value: unknown): value is TgpuNamable {
  return !!(value as TgpuNamable)?.$name;
}

export function getMetaData(
  definition: unknown,
): MetaData | undefined {
  return (globalThis as unknown as GlobalWithMeta).__TYPEGPU_META__.get(
    // biome-ignore lint/suspicious/noExplicitAny: it's fine, if it's not an object, the get will return undefined
    definition as any,
  );
}

export function setMetaData(definition: object, metaData: object) {
  (globalThis as unknown as GlobalWithMeta).__TYPEGPU_META__ ??= new WeakMap();
  const map = (globalThis as unknown as GlobalWithMeta).__TYPEGPU_META__;
  map.set(definition, { ...map.get(definition), ...metaData });
}
