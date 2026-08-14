import { isData } from '../data/dataTypes.ts';
import { setName } from '../shared/meta.ts';
import type { TgpuSoul } from '../shared/soul.ts';
import { $internal, $soul, isMarkedInternal } from '../shared/symbols.ts';
import { soulRestorers, type TgpuResourceSoul, type TransferableResourceType } from './restore.ts';
import { deserializeDataSchema, serializeDataSchema, type SerializedDataSchema } from './schema.ts';
import type { RestoreContext } from './types.ts';

export type { TgpuResourceSoul, TransferableResourceType };

/** What travels between runtimes: a plain copy of a TypeGPU resource's soul */
export type TgpuResourceSnapshot = TgpuResourceSoul;

type MaterializableInternals = { readonly materialize?: (() => unknown) | undefined };

/**
 * Every data schema is callable, and host serializers claim functions before
 * they ever ask whether a value is transferable, so schemas held by a soul are
 * replaced with a description of themselves on the way out
 */
const DATA_SCHEMA_KEY = '~tgpuDataSchema';

type TaggedDataSchema = { [DATA_SCHEMA_KEY]: SerializedDataSchema };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Rebuilds containers only when something inside them changed, so raw handles
 * are passed through untouched. `path` keeps self-referencing objects finite
 */
function mapContainer(
  value: unknown,
  path: Set<object>,
  mapField: (field: unknown, path: Set<object>) => unknown,
): unknown {
  const isArray = Array.isArray(value);
  if (!isArray && !isPlainRecord(value)) {
    return value;
  }
  if (path.has(value as object)) {
    return value;
  }

  path.add(value as object);
  try {
    if (isArray) {
      const mapped = value.map((field) => mapField(field, path));
      return mapped.some((field, idx) => field !== value[idx]) ? mapped : value;
    }
    const entries = Object.entries(value);
    const mapped = entries.map(([key, field]): [string, unknown] => [key, mapField(field, path)]);
    return mapped.some(([, field], idx) => field !== entries[idx]?.[1])
      ? Object.fromEntries(mapped)
      : value;
  } finally {
    path.delete(value as object);
  }
}

function describeSchemas(value: unknown, path: Set<object> = new Set()): unknown {
  if (isData(value)) {
    return { [DATA_SCHEMA_KEY]: serializeDataSchema(value) } satisfies TaggedDataSchema;
  }
  return mapContainer(value, path, describeSchemas);
}

function reviveSchemas(value: unknown, path: Set<object> = new Set()): unknown {
  if (isPlainRecord(value)) {
    const described = value[DATA_SCHEMA_KEY];
    if (described) {
      return deserializeDataSchema(described as SerializedDataSchema);
    }
  }
  return mapContainer(value, path, reviveSchemas);
}

function soulOf(value: unknown): TgpuSoul | undefined {
  const soul = (value as { [$soul]?: TgpuSoul } | undefined)?.[$soul];
  return soul && soul.type in soulRestorers ? soul : undefined;
}

/** Whether the value is something {@link snapshotResource} can carry across a device boundary */
export function isTransferableResource(value: unknown): boolean {
  return soulOf(value) !== undefined;
}

/** Whether the value is a class-like TypeGPU object that {@link snapshotResource} cannot carry */
export function isNonTransferableResource(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isData(value) &&
    isMarkedInternal(value) &&
    !isTransferableResource(value)
  );
}

/**
 * Extracts what survives a device boundary: the resource's soul, completed by
 * materialization for resources whose definition is a compiled object
 */
export function snapshotResource(value: unknown): TgpuResourceSnapshot | undefined {
  const soul = soulOf(value);
  if (!soul) {
    return undefined;
  }

  (value as { [$internal]?: MaterializableInternals })[$internal]?.materialize?.();

  const nonTransferable = (soul as { nonTransferablePriors?: string[] }).nonTransferablePriors;
  if (nonTransferable?.length) {
    throw new Error(
      `TypeGPU '${soul.type}' cannot be transferred: ${nonTransferable.join(', ')} ${
        nonTransferable.length > 1 ? 'are' : 'is'
      } bound to this runtime. Apply them after the resource crosses the boundary.`,
    );
  }

  return describeSchemas({ ...soul }) as TgpuResourceSoul;
}

export function restoreResource(snapshot: TgpuResourceSnapshot, ctx: RestoreContext): unknown {
  const restore = (
    soulRestorers as unknown as Record<string, (soul: TgpuSoul, ctx: RestoreContext) => unknown>
  )[snapshot.type];
  if (!restore) {
    throw new Error(`TypeGPU resource '${snapshot.type}' has no restorer registered.`);
  }

  const resource = restore(reviveSchemas(snapshot) as TgpuSoul, ctx);
  // A root is restored by identity, it keeps the name the receiving runtime gave it
  if (snapshot.label !== undefined && snapshot.type !== 'root') {
    setName(resource as object, snapshot.label);
  }
  return resource;
}
