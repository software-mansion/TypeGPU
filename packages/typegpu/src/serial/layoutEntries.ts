import * as d from '../data/index.ts';
import type { TgpuLayoutEntry } from '../tgpuBindGroupLayout.ts';
import type { TgpuShaderStage } from '../types.ts';
import { deserializeDataSchema, serializeDataSchema, type SerializedDataSchema } from './schema.ts';

type SerializedTextureSchema =
  | {
      kind: 'sampled';
      type: d.WgslTexture['type'];
      sampleType: SerializedDataSchema;
    }
  | {
      kind: 'storage';
      type: d.WgslStorageTexture['type'];
      format: d.WgslStorageTexture['format'];
      access: d.WgslStorageTexture['access'];
    };

export type SerializedLayoutEntry =
  | null
  | { type: 'uniform'; schema: SerializedDataSchema; visibility?: TgpuShaderStage[] | undefined }
  | {
      type: 'storage';
      schema: SerializedDataSchema;
      access?: 'mutable' | 'readonly' | undefined;
      visibility?: TgpuShaderStage[] | undefined;
    }
  | {
      type: 'sampler';
      sampler: 'filtering' | 'non-filtering' | 'comparison';
      visibility?: TgpuShaderStage[] | undefined;
    }
  | {
      type: 'texture';
      schema: SerializedTextureSchema;
      sampleType?: GPUTextureSampleType | undefined;
      visibility?: TgpuShaderStage[] | undefined;
    }
  | {
      type: 'storage-texture';
      schema: SerializedTextureSchema;
      visibility?: TgpuShaderStage[] | undefined;
    }
  | {
      type: 'external-texture';
      visibility?: TgpuShaderStage[] | undefined;
    };

function serializeTextureSchema(
  schema: d.WgslTexture | d.WgslStorageTexture,
): SerializedTextureSchema {
  if ('multisampled' in schema) {
    return {
      kind: 'sampled',
      type: schema.type,
      sampleType: serializeDataSchema(schema.sampleType),
    };
  }
  return {
    kind: 'storage',
    type: schema.type,
    format: schema.format,
    access: schema.access,
  };
}

const sampledTextureConstructors = {
  texture_1d: (sampleType) => d.texture1d(sampleType),
  texture_2d: (sampleType) => d.texture2d(sampleType),
  texture_2d_array: (sampleType) => d.texture2dArray(sampleType),
  texture_3d: (sampleType) => d.texture3d(sampleType),
  texture_cube: (sampleType) => d.textureCube(sampleType),
  texture_cube_array: (sampleType) => d.textureCubeArray(sampleType),
  texture_multisampled_2d: (sampleType) => d.textureMultisampled2d(sampleType),
  texture_depth_2d: () => d.textureDepth2d(),
  texture_depth_2d_array: () => d.textureDepth2dArray(),
  texture_depth_cube: () => d.textureDepthCube(),
  texture_depth_cube_array: () => d.textureDepthCubeArray(),
  texture_depth_multisampled_2d: () => d.textureDepthMultisampled2d(),
} satisfies Record<d.WgslTexture['type'], (sampleType: d.WgslTexture['sampleType']) => unknown>;

const storageTextureConstructors = {
  texture_storage_1d: (format, access) => d.textureStorage1d(format, access),
  texture_storage_2d: (format, access) => d.textureStorage2d(format, access),
  texture_storage_2d_array: (format, access) => d.textureStorage2dArray(format, access),
  texture_storage_3d: (format, access) => d.textureStorage3d(format, access),
} satisfies Record<
  d.WgslStorageTexture['type'],
  (format: d.WgslStorageTexture['format'], access: d.WgslStorageTexture['access']) => unknown
>;

function deserializeTextureSchema(schema: SerializedTextureSchema) {
  if (schema.kind === 'sampled') {
    const constructor = sampledTextureConstructors[schema.type];
    if (!constructor) {
      throw new Error(`TypeGPU texture schema '${schema.type}' could not be reconstructed.`);
    }
    return constructor(deserializeDataSchema(schema.sampleType) as d.WgslTexture['sampleType']);
  }
  const constructor = storageTextureConstructors[schema.type];
  if (!constructor) {
    throw new Error(`TypeGPU storage texture schema '${schema.type}' could not be reconstructed.`);
  }
  return constructor(schema.format, schema.access);
}

export function serializeLayoutEntry(entry: TgpuLayoutEntry | null): SerializedLayoutEntry {
  if (entry === null) {
    return null;
  }
  const visibility = entry.visibility;
  if ('uniform' in entry) {
    return { type: 'uniform', schema: serializeDataSchema(entry.uniform), visibility };
  }
  if ('storage' in entry) {
    return {
      type: 'storage',
      // The layout a runtime-sized entry produces is count-independent, so a zero stand-in works
      schema: serializeDataSchema('type' in entry.storage ? entry.storage : entry.storage(0)),
      access: entry.access,
      visibility,
    };
  }
  if ('sampler' in entry) {
    return { type: 'sampler', sampler: entry.sampler, visibility };
  }
  if ('texture' in entry) {
    return {
      type: 'texture',
      schema: serializeTextureSchema(entry.texture),
      sampleType: entry.sampleType,
      visibility,
    };
  }
  if ('storageTexture' in entry) {
    return {
      type: 'storage-texture',
      schema: serializeTextureSchema(entry.storageTexture),
      visibility,
    };
  }
  if ('externalTexture' in entry) {
    return { type: 'external-texture', visibility };
  }
  throw new Error('Only buffer, sampler, and texture bind group layout entries can be serialized.');
}

export function deserializeLayoutEntry(entry: SerializedLayoutEntry): TgpuLayoutEntry | null {
  if (entry === null) {
    return null;
  }
  const visibility = entry.visibility ? { visibility: entry.visibility } : {};
  if (entry.type === 'uniform') {
    return { uniform: deserializeDataSchema(entry.schema), ...visibility };
  }
  if (entry.type === 'storage') {
    return {
      storage: deserializeDataSchema(entry.schema),
      ...(entry.access ? { access: entry.access } : {}),
      ...visibility,
    };
  }
  if (entry.type === 'sampler') {
    return { sampler: entry.sampler, ...visibility };
  }
  if (entry.type === 'texture') {
    return {
      texture: deserializeTextureSchema(entry.schema) as d.WgslTexture,
      ...(entry.sampleType ? { sampleType: entry.sampleType } : {}),
      ...visibility,
    };
  }
  if (entry.type === 'storage-texture') {
    return {
      storageTexture: deserializeTextureSchema(entry.schema) as d.WgslStorageTexture,
      ...visibility,
    };
  }
  if (entry.type === 'external-texture') {
    return { externalTexture: d.textureExternal(), ...visibility };
  }
  throw new Error('TypeGPU bind group layout entry payload could not be reconstructed.');
}
