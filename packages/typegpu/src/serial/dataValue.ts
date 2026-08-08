import { readFromArrayBuffer, writeToArrayBuffer } from '../data/dataIO.ts';
import { sizeOf } from '../data/sizeOf.ts';
import {
  type AnyMatInstance,
  type AnyVecInstance,
  type AnyWgslData,
  isMatInstance,
  isVecInstance,
} from '../data/wgslTypes.ts';
import * as d from '../data/index.ts';

export interface TgpuDataValueSnapshot {
  readonly type: 'data-value';
  readonly kind: string;
  readonly bytes: ArrayBuffer;
}

export function isSnapshotableDataValue(value: unknown): value is AnyVecInstance | AnyMatInstance {
  return isVecInstance(value) || isMatInstance(value);
}

function schemaForKind(kind: string): AnyWgslData {
  // Boolean vectors report kinds like 'vec2<bool>', but their schemas are exported as 'vec2b'
  const key = kind.replace('<bool>', 'b');
  const schema = (d as unknown as Record<string, AnyWgslData>)[key];
  if (!schema) {
    throw new Error(`Data value of kind '${kind}' cannot be serialized.`);
  }
  return schema;
}

export function INTERNAL_snapshotDataValue(
  value: AnyVecInstance | AnyMatInstance,
): TgpuDataValueSnapshot {
  const schema = schemaForKind(value.kind);
  const bytes = new ArrayBuffer(sizeOf(schema));
  writeToArrayBuffer(bytes, schema, value);
  return { type: 'data-value', kind: value.kind, bytes };
}

export function INTERNAL_restoreDataValue(
  snapshot: TgpuDataValueSnapshot,
): AnyVecInstance | AnyMatInstance {
  const schema = schemaForKind(snapshot.kind);
  return readFromArrayBuffer(snapshot.bytes, schema) as AnyVecInstance | AnyMatInstance;
}
