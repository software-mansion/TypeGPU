import * as d from '../data/index.ts';
import { assertExhaustive } from '../shared/utilityTypes.ts';

type SerializedDataAttrib =
  | { type: 'align'; value: number }
  | { type: 'size'; value: number }
  | { type: 'location'; value: number }
  | { type: 'interpolate'; value: string }
  | { type: 'builtin'; value: string }
  | { type: 'invariant' };

export type SerializedDataSchema =
  | { type: 'd'; key: string }
  | { type: 'array'; element: SerializedDataSchema; count: number }
  | { type: 'disarray'; element: SerializedDataSchema; count: number }
  | { type: 'struct'; props: [string, SerializedDataSchema][] }
  | { type: 'unstruct'; props: [string, SerializedDataSchema][] }
  | { type: 'atomic'; inner: SerializedDataSchema }
  | { type: 'decorated'; inner: SerializedDataSchema; attribs: SerializedDataAttrib[] };

// Maps schema singletons (e.g. `d.f32`) back to their `d` export names
let leafKeys: Map<unknown, string> | undefined;

function getDataSchemaKey(schema: d.BaseData): string | undefined {
  if (!leafKeys) {
    leafKeys = new Map();
    for (const [key, value] of Object.entries(d)) {
      if ((typeof value === 'object' || typeof value === 'function') && value !== null) {
        leafKeys.set(value, key);
      }
    }
  }
  return leafKeys.get(schema);
}

let builtinsByName: Map<string, d.AnyData> | undefined;

function getBuiltinByName(value: string): d.AnyData {
  if (!builtinsByName) {
    builtinsByName = new Map();
    for (const candidate of Object.values(d.builtin) as d.AnyData[]) {
      if (!d.isDecorated(candidate) && !d.isLooseDecorated(candidate)) {
        continue;
      }
      const builtin = candidate.attribs.find(d.isBuiltinAttrib);
      if (builtin) {
        builtinsByName.set(builtin.params[0], candidate);
      }
    }
  }
  const builtin = builtinsByName.get(value);
  if (!builtin) {
    throw new Error(`TypeGPU builtin '${value}' could not be reconstructed.`);
  }
  return builtin;
}

function serializeAttrib(attrib: unknown): SerializedDataAttrib {
  if (d.isAlignAttrib(attrib)) {
    return { type: 'align', value: attrib.params[0] };
  }
  if (d.isSizeAttrib(attrib)) {
    return { type: 'size', value: attrib.params[0] };
  }
  if (d.isLocationAttrib(attrib)) {
    return { type: 'location', value: attrib.params[0] };
  }
  if (d.isInterpolateAttrib(attrib)) {
    return { type: 'interpolate', value: attrib.params[0] };
  }
  if (d.isBuiltinAttrib(attrib)) {
    return { type: 'builtin', value: attrib.params[0] };
  }
  if (d.isInvariantAttrib(attrib)) {
    return { type: 'invariant' };
  }
  throw new Error('This TypeGPU schema decorator cannot be serialized yet.');
}

function applyAttrib(schema: d.AnyData, attrib: SerializedDataAttrib): d.AnyData {
  if (attrib.type === 'align') {
    return d.align(attrib.value, schema);
  }
  if (attrib.type === 'size') {
    return d.size(attrib.value, schema);
  }
  if (attrib.type === 'location') {
    return d.location(attrib.value, schema);
  }
  if (attrib.type === 'interpolate') {
    return d.interpolate(attrib.value as never, schema as never);
  }
  if (attrib.type === 'builtin') {
    return getBuiltinByName(attrib.value);
  }
  if (attrib.type === 'invariant') {
    return d.invariant(schema as Parameters<typeof d.invariant>[0]);
  }
  assertExhaustive(attrib, 'schema.ts#applyAttrib');
}

function serializeProps(propTypes: Record<string, d.BaseData>): [string, SerializedDataSchema][] {
  return Object.entries(propTypes).map(([prop, propType]) => [prop, serializeDataSchema(propType)]);
}

function deserializeProps(props: [string, SerializedDataSchema][]): Record<string, d.AnyData> {
  return Object.fromEntries(props.map(([prop, schema]) => [prop, deserializeDataSchema(schema)]));
}

export function serializeDataSchema(schema: d.BaseData): SerializedDataSchema {
  const key = getDataSchemaKey(schema);
  if (key) {
    return { type: 'd', key };
  }

  if (d.isDecorated(schema) || d.isLooseDecorated(schema)) {
    return {
      type: 'decorated',
      inner: serializeDataSchema(schema.inner as d.AnyData),
      attribs: schema.attribs.map(serializeAttrib),
    };
  }

  if (d.isAtomic(schema)) {
    return { type: 'atomic', inner: serializeDataSchema(schema.inner as d.AnyData) };
  }

  if (d.isWgslArray(schema)) {
    return {
      type: 'array',
      element: serializeDataSchema(schema.elementType as d.AnyData),
      count: schema.elementCount,
    };
  }

  if (d.isDisarray(schema)) {
    return {
      type: 'disarray',
      element: serializeDataSchema(schema.elementType as d.AnyData),
      count: schema.elementCount,
    };
  }

  if (d.isWgslStruct(schema)) {
    return { type: 'struct', props: serializeProps(schema.propTypes) };
  }

  if (d.isUnstruct(schema)) {
    return { type: 'unstruct', props: serializeProps(schema.propTypes) };
  }

  throw new Error(`TypeGPU schema '${schema.type}' cannot be serialized yet.`);
}

export function deserializeDataSchema(schema: SerializedDataSchema): d.AnyData {
  if (schema.type === 'd') {
    const leaf = (d as unknown as Record<string, d.AnyData>)[schema.key];
    if (!leaf) {
      throw new Error(`TypeGPU schema 'd.${schema.key}' could not be reconstructed.`);
    }
    return leaf;
  }

  if (schema.type === 'array') {
    return d.arrayOf(
      deserializeDataSchema(schema.element) as d.AnyWgslData,
      schema.count,
    ) as d.AnyData;
  }

  if (schema.type === 'disarray') {
    return d.disarrayOf(deserializeDataSchema(schema.element), schema.count) as d.AnyData;
  }

  if (schema.type === 'struct') {
    return d.struct(deserializeProps(schema.props) as Record<string, d.AnyWgslData>) as d.AnyData;
  }

  if (schema.type === 'unstruct') {
    return d.unstruct(deserializeProps(schema.props)) as d.AnyData;
  }

  if (schema.type === 'atomic') {
    return d.atomic(deserializeDataSchema(schema.inner) as d.U32 | d.I32) as d.AnyData;
  }

  if (schema.type === 'decorated') {
    let result = deserializeDataSchema(schema.inner);
    for (let i = schema.attribs.length - 1; i >= 0; i--) {
      const attrib = schema.attribs[i] as SerializedDataAttrib;
      result = applyAttrib(result, attrib);
    }
    return result;
  }

  throw new Error('TypeGPU schema payload could not be reconstructed.');
}
