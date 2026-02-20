import {
  isBuffer,
  type TgpuBuffer,
  type UniformFlag,
} from './core/buffer/buffer.ts';
import {
  isUsableAsUniform,
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  TgpuLaidOutBufferImpl,
} from './core/buffer/bufferUsage.ts';
import {
  isComparisonSampler,
  isSampler,
  type TgpuComparisonSampler,
  TgpuLaidOutSamplerImpl,
  type TgpuSampler,
} from './core/sampler/sampler.ts';
import {
  comparisonSampler as wgslComparisonSampler,
  sampler as wgslSampler,
} from './data/sampler.ts';
import {
  type TgpuExternalTexture,
  TgpuExternalTextureImpl,
} from './core/texture/externalTexture.ts';
import {
  isTexture,
  isTextureView,
  type PropsForSchema,
  TgpuLaidOutTextureViewImpl,
  type TgpuTexture,
  type TgpuTextureView,
} from './core/texture/texture.ts';
import {
  isUsableAsSampled,
  NotSampledError,
  type SampledFlag,
} from './core/texture/usageExtension.ts';
import { f32, i32, u32 } from './data/numeric.ts';
import {
  type StorageTextureDimension,
  textureDescriptorToSchema,
  type TextureSchemaForDescriptor,
  type WgslExternalTexture,
  type WgslStorageTexture,
  type WgslTexture,
} from './data/texture.ts';
import type { StorageTextureFormats } from './core/texture/textureFormats.ts';
import type { AnyWgslData, BaseData, F32, I32, U32 } from './data/wgslTypes.ts';
import { NotUniformError } from './errors.ts';
import {
  isUsableAsStorage,
  NotStorageError,
  type StorageFlag,
} from './extension.ts';
import type { TgpuNamable } from './shared/meta.ts';
import { getName, setName } from './shared/meta.ts';
import type { Infer, MemIdentity } from './shared/repr.ts';
import { safeStringify } from './shared/stringify.ts';
import { $gpuValueOf, $internal } from './shared/symbols.ts';
import type {
  Default,
  NullableToOptional,
  Prettify,
} from './shared/utilityTypes.ts';
import type { TgpuShaderStage } from './types.ts';
import type { Unwrapper } from './unwrapper.ts';
import type { WgslComparisonSampler, WgslSampler } from './data/sampler.ts';

// ----------
// Public API
// ----------

export interface LayoutMembership {
  layout: TgpuBindGroupLayout;
  key: string;
  idx: number;
}

export type TgpuLayoutEntryBase = {
  /**
   * Limits this resource's visibility to specific shader stages.
   *
   * By default, each resource is visible to all shader stage types, but
   * depending on the underlying implementation, this may have performance implications.
   *
   * @default ['compute','fragment'] for mutable resources
   * @default ['compute','vertex','fragment'] for everything else
   */
  visibility?: TgpuShaderStage[];
};

export type TgpuLayoutUniform = TgpuLayoutEntryBase & {
  uniform: BaseData;
};

export type TgpuLayoutStorage = TgpuLayoutEntryBase & {
  storage: BaseData | ((arrayLength: number) => BaseData);
  /** @default 'readonly' */
  access?: 'mutable' | 'readonly';
};

export type TgpuLayoutSampler = TgpuLayoutEntryBase & {
  sampler: 'filtering' | 'non-filtering';
};

export type TgpuLayoutComparisonSampler = TgpuLayoutEntryBase & {
  sampler: 'comparison';
};

export type TgpuLayoutTexture<TSchema extends WgslTexture = WgslTexture> =
  & TgpuLayoutEntryBase
  & {
    texture: TSchema;
    sampleType?: GPUTextureSampleType;
  };

export type TgpuLayoutStorageTexture<
  TSchema extends WgslStorageTexture = WgslStorageTexture,
> = TgpuLayoutEntryBase & {
  storageTexture: TSchema;
};

export type TgpuLayoutExternalTexture = TgpuLayoutEntryBase & {
  externalTexture: WgslExternalTexture;
};

export type TgpuLegacyLayoutTexture<
  TSampleType extends GPUTextureSampleType = GPUTextureSampleType,
> = TgpuLayoutEntryBase & {
  /**
   * - 'float' - f32
   * - 'unfilterable-float' - f32, cannot be used with filtering samplers
   * - 'depth' - f32
   * - 'sint' - i32
   * - 'uint' - u32
   */
  texture: TSampleType;
  /**
   * @default '2d'
   */
  viewDimension?: GPUTextureViewDimension;
  /**
   * @default false
   */
  multisampled?: boolean;
};

export type TgpuLegacyLayoutStorageTexture<
  TFormat extends StorageTextureFormats = StorageTextureFormats,
> = TgpuLayoutEntryBase & {
  storageTexture: TFormat;
  /** @default 'writeonly' */
  access?: 'readonly' | 'writeonly' | 'mutable';
  /** @default '2d' */
  viewDimension?: StorageTextureDimension;
};

export type TgpuLegacyLayoutExternalTexture = TgpuLayoutEntryBase & {
  externalTexture: Record<string, never>;
};

export type TgpuLegacyLayoutEntry =
  | TgpuLayoutUniform
  | TgpuLayoutStorage
  | TgpuLayoutSampler
  | TgpuLayoutComparisonSampler
  | TgpuLegacyLayoutTexture
  | TgpuLegacyLayoutStorageTexture
  | TgpuLegacyLayoutExternalTexture;

export type TgpuLayoutEntry =
  | TgpuLayoutUniform
  | TgpuLayoutStorage
  | TgpuLayoutSampler
  | TgpuLayoutComparisonSampler
  | TgpuLayoutTexture
  | TgpuLayoutStorageTexture
  | TgpuLayoutExternalTexture;

type SampleTypeToPrimitive = {
  float: F32;
  'unfilterable-float': F32;
  depth: F32;
  sint: I32;
  uint: U32;
};

type LeagcyAccessToAccess = {
  writeonly: 'write-only';
  readonly: 'read-only';
  mutable: 'read-write';
};

type MapLegacyTextureToUpToDate<
  T extends Record<string, TgpuLegacyLayoutEntry | TgpuLayoutEntry | null>,
> = {
  [K in keyof T]: T[K] extends TgpuLayoutEntry | null ? T[K]
    : T[K] extends TgpuLegacyLayoutTexture<infer SampleType>
      ? TgpuLayoutTexture<
        TextureSchemaForDescriptor<{
          dimension: Default<T[K]['viewDimension'], '2d'>;
          sampleType: SampleTypeToPrimitive[SampleType];
          multisampled: Default<T[K]['multisampled'], false>;
        }>
      >
    : T[K] extends TgpuLegacyLayoutStorageTexture<infer Format>
      ? TgpuLayoutStorageTexture<
        TextureSchemaForDescriptor<{
          access: LeagcyAccessToAccess[Default<T[K]['access'], 'writeonly'>];
          format: Format;
          dimension: Default<T[K]['viewDimension'], '2d'>;
        }>
      >
    : T[K] extends TgpuLegacyLayoutExternalTexture ? TgpuLayoutExternalTexture
    : never;
};

/**
 * Converts legacy entries to new API format
 */
function convertLegacyEntries(
  entries: Record<string, TgpuLegacyLayoutEntry | TgpuLayoutEntry | null>,
): Record<string, TgpuLayoutEntry | null> {
  const result: Record<string, TgpuLayoutEntry | null> = {};

  for (const [key, entry] of Object.entries(entries)) {
    if (entry === null) {
      result[key] = null;
      continue;
    }

    if ('texture' in entry && typeof entry.texture === 'string') {
      const sampleType = entry.texture;
      result[key] = {
        ...entry,
        texture: textureDescriptorToSchema({
          dimension: entry.viewDimension ?? '2d',
          sampleType: sampleType === 'sint'
            ? i32
            : sampleType === 'uint'
            ? u32
            : f32,
          multisampled: entry.multisampled ?? false,
        }),
      };
    } else if (
      'storageTexture' in entry && typeof entry.storageTexture === 'string'
    ) {
      const accessMap = {
        readonly: 'read-only',
        writeonly: 'write-only',
        mutable: 'read-write',
      } as const;
      result[key] = {
        ...entry,
        storageTexture: textureDescriptorToSchema({
          access: accessMap[entry.access ?? 'writeonly'],
          format: entry.storageTexture,
          dimension: entry.viewDimension ?? '2d',
        }),
      };
    } else if (
      'externalTexture' in entry &&
      Object.keys(entry.externalTexture).length === 0
    ) {
      result[key] = {
        ...entry,
        externalTexture: {
          type: 'texture_external',
          dimension: '2d',
        } as WgslExternalTexture,
      } as TgpuLayoutExternalTexture;
    } else {
      result[key] = entry as TgpuLayoutEntry;
    }
  }

  return result;
}

type UnwrapRuntimeConstructorInner<
  T extends BaseData | ((_: number) => BaseData),
> = T extends (_: number) => BaseData ? ReturnType<T> : T;

export type UnwrapRuntimeConstructor<
  T extends BaseData | ((_: number) => BaseData),
> = T extends unknown ? UnwrapRuntimeConstructorInner<T> : never;

interface BindGroupLayoutInternals<
  Entries extends Record<string, TgpuLayoutEntry | null>,
> {
  bound: { [K in keyof Entries]: BindLayoutEntry<Entries[K]> };
}

export interface TgpuBindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<
    string,
    TgpuLayoutEntry | null
  >,
> extends TgpuNamable {
  readonly [$internal]: BindGroupLayoutInternals<Entries>;
  readonly resourceType: 'bind-group-layout';
  readonly entries: Entries;
  /**
   * @deprecated Use `layout.$.foo` instead of `layout.bound.foo.$`
   */
  readonly bound: {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
  };
  readonly [$gpuValueOf]: {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };
  readonly $: {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };

  /**
   * An explicit numeric index assigned to this bind group layout. If undefined, a unique
   * index is assigned automatically during resolution. This can be changed with the
   * `.$idx()` method.
   */
  readonly index: number | undefined;

  /**
   * Associates this bind group layout with an explicit numeric index. When a call to this
   * method is omitted, a unique numeric index is assigned to it automatically.
   *
   * Used when generating WGSL code: `@group(${index}) @binding(...) ...;`
   */
  $idx(index?: number): this;

  /**
   * Creates a raw WebGPU resource based on the typed descriptor.
   * NOTE: This creates a new resource every time, better to use `root.unwrap(...)` instead.
   * @param unwrapper Used to unwrap any resources that this resource depends on.
   */
  unwrap(unwrapper: Unwrapper): GPUBindGroupLayout;
}

type StorageUsageForEntry<T extends TgpuLayoutStorage> = T extends {
  access?: infer Access;
} // Is the access defined on the type?
  ? 'mutable' | 'readonly' extends Access // Is the access ambiguous?
    ?
      | TgpuBufferReadonly<UnwrapRuntimeConstructor<T['storage']>>
      | TgpuBufferMutable<UnwrapRuntimeConstructor<T['storage']>>
  : 'readonly' extends Access // Is the access strictly 'readonly'?
    ? TgpuBufferReadonly<UnwrapRuntimeConstructor<T['storage']>>
  : 'mutable' extends Access // Is the access strictly 'mutable'?
    ? TgpuBufferMutable<UnwrapRuntimeConstructor<T['storage']>>
  :
    | TgpuBufferReadonly<UnwrapRuntimeConstructor<T['storage']>>
    | TgpuBufferMutable<UnwrapRuntimeConstructor<T['storage']>>
  : TgpuBufferReadonly<UnwrapRuntimeConstructor<T['storage']>>; // <- access is undefined, so default to 'readonly';

export type LayoutEntryToInput<T extends TgpuLayoutEntry | null> =
  // Widest type
  TgpuLayoutEntry | null extends T ?
      | TgpuBuffer<AnyWgslData>
      | GPUBuffer
      | TgpuSampler
      | GPUSampler
      | TgpuComparisonSampler
      | TgpuTexture
      | GPUTextureView
      | GPUExternalTexture
    // Strict type-checking
    : T extends TgpuLayoutUniform ?
        | (
          & TgpuBuffer<MemIdentity<UnwrapRuntimeConstructor<T['uniform']>>>
          & UniformFlag
        )
        | GPUBuffer
    : T extends TgpuLayoutStorage ?
        | (
          & TgpuBuffer<MemIdentity<UnwrapRuntimeConstructor<T['storage']>>>
          & StorageFlag
        )
        | GPUBuffer
    : T extends TgpuLayoutSampler ? TgpuSampler | GPUSampler
    : T extends TgpuLayoutComparisonSampler ? TgpuComparisonSampler | GPUSampler
    : T extends TgpuLayoutTexture ?
        | GPUTextureView
        | GPUTexture
        | (SampledFlag & TgpuTexture<Prettify<PropsForSchema<T['texture']>>>)
        | TgpuTextureView<WgslTexture>
    : T extends TgpuLayoutStorageTexture ?
        | GPUTextureView
        | GPUTexture
        | (
          & StorageFlag
          & TgpuTexture<Prettify<PropsForSchema<T['storageTexture']>>>
        )
        | TgpuTextureView<WgslStorageTexture>
    : T extends TgpuLayoutExternalTexture ? GPUExternalTexture
    : never;

export type BindLayoutEntry<T extends TgpuLayoutEntry | null> = T extends
  TgpuLayoutUniform ? TgpuBufferUniform<T['uniform']>
  : T extends TgpuLayoutStorage ? StorageUsageForEntry<T>
  : T extends TgpuLayoutSampler ? TgpuSampler
  : T extends TgpuLayoutComparisonSampler ? TgpuComparisonSampler
  : T extends TgpuLayoutTexture<infer TSchema> ? TgpuTextureView<TSchema>
  : T extends TgpuLayoutStorageTexture<infer TSchema> ? TgpuTextureView<TSchema>
  : T extends TgpuLayoutExternalTexture ? TgpuExternalTexture
  : never;

export type InferLayoutEntry<T extends TgpuLayoutEntry | null> = T extends
  TgpuLayoutUniform ? Infer<T['uniform']>
  : T extends TgpuLayoutStorage ? Infer<UnwrapRuntimeConstructor<T['storage']>>
  : T extends TgpuLayoutSampler ? Infer<WgslSampler>
  : T extends TgpuLayoutComparisonSampler ? Infer<WgslComparisonSampler>
  : T extends TgpuLayoutTexture<infer TSchema> ? Infer<TSchema>
  : T extends TgpuLayoutStorageTexture<infer TSchema> ? Infer<TSchema>
  : T extends TgpuLayoutExternalTexture ? Infer<T['externalTexture']>
  : never;

export type ExtractBindGroupInputFromLayout<
  T extends Record<string, TgpuLayoutEntry | null>,
> = NullableToOptional<{ [K in keyof T]: LayoutEntryToInput<T[K]> }>;

export type TgpuBindGroup<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<
    string,
    TgpuLayoutEntry | null
  >,
> = {
  readonly resourceType: 'bind-group';
  readonly layout: TgpuBindGroupLayout<Entries>;
  unwrap(unwrapper: Unwrapper): GPUBindGroup;
};

export function bindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null>,
>(entries: Entries): TgpuBindGroupLayout<Prettify<Entries>>;
/**
 * @deprecated Layouts containing the legacy texture api entries are deprecated and will be removed in future versions. Please use the up-to-date texture api entries instead.
 */
export function bindGroupLayout<
  Entries extends Record<string, TgpuLegacyLayoutEntry | null>,
>(
  entries: Entries,
): TgpuBindGroupLayout<
  Prettify<MapLegacyTextureToUpToDate<Entries>>
>;
export function bindGroupLayout<
  Entries extends Record<
    string,
    TgpuLayoutEntry | TgpuLegacyLayoutEntry | null
  >,
>(entries: Entries): MapLegacyTextureToUpToDate<Entries> {
  const convertedEntries = convertLegacyEntries(entries);
  return new TgpuBindGroupLayoutImpl(
    convertedEntries,
  ) as MapLegacyTextureToUpToDate<
    Entries
  >;
}

export function isBindGroupLayout(
  value: unknown,
): value is TgpuBindGroupLayout {
  return !!value &&
    (value as TgpuBindGroupLayout).resourceType === 'bind-group-layout';
}

export function isBindGroup(
  value: unknown,
): value is TgpuBindGroup {
  return !!value && (value as TgpuBindGroup).resourceType === 'bind-group';
}

/**
 * @category Errors
 */
export class MissingBindingError extends Error {
  constructor(groupLabel: string | undefined, key: string) {
    super(
      `Bind group '${
        groupLabel ?? '<unnamed>'
      }' is missing a required binding '${key}'`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindingError.prototype);
  }
}

// --------------
// Implementation
// --------------

const DEFAULT_MUTABLE_VISIBILITY: TgpuShaderStage[] = ['compute', 'fragment'];
const DEFAULT_READONLY_VISIBILITY: TgpuShaderStage[] = [
  'compute',
  'vertex',
  'fragment',
];

class TgpuBindGroupLayoutImpl<
  Entries extends Record<string, TgpuLayoutEntry | null>,
> implements TgpuBindGroupLayout<Entries> {
  public readonly [$internal]: BindGroupLayoutInternals<Entries>;
  private _index: number | undefined;

  public readonly resourceType = 'bind-group-layout' as const;

  public readonly value = {} as {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };

  public readonly $ = this.value as {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };

  get [$gpuValueOf]() {
    return this.$;
  }

  constructor(public readonly entries: Entries) {
    let idx = 0;

    const bound = {} as { [K in keyof Entries]: BindLayoutEntry<Entries[K]> };
    this[$internal] = { bound };

    for (const [key, entry] of Object.entries(entries)) {
      if (entry === null) {
        idx++;
        continue;
      }

      const membership: LayoutMembership = { layout: this, key, idx };

      if ('uniform' in entry) {
        // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
        (bound[key] as any) = new TgpuLaidOutBufferImpl(
          'uniform',
          entry.uniform,
          membership,
        );
      }

      if ('storage' in entry) {
        const dataType = 'type' in entry.storage
          ? entry.storage
          : entry.storage(0);

        // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
        (bound[key] as any) = new TgpuLaidOutBufferImpl(
          entry.access ?? 'readonly',
          dataType,
          membership,
        );
      }

      if ('texture' in entry) {
        // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
        (bound[key] as any) = new TgpuLaidOutTextureViewImpl(
          entry.texture,
          membership,
        );
      }

      if ('storageTexture' in entry) {
        // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
        (bound[key] as any) = new TgpuLaidOutTextureViewImpl(
          entry.storageTexture,
          membership,
        );
      }

      if ('externalTexture' in entry) {
        // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
        (bound[key] as any) = new TgpuExternalTextureImpl(
          entry.externalTexture,
          membership,
        );
      }

      if ('sampler' in entry) {
        // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
        (bound[key] as any) = new TgpuLaidOutSamplerImpl(
          entry.sampler === 'comparison'
            ? wgslComparisonSampler()
            : wgslSampler(),
          membership,
        );
      }

      Object.defineProperty(this.value, key, {
        get: () => {
          // oxlint-disable-next-line typescript/no-explicit-any no need for type magic
          return (bound[key] as any).value;
        },
      });

      idx++;
    }
  }

  toString(): string {
    return `bindGroupLayout:${getName(this) ?? '<unnamed>'}`;
  }

  get index(): number | undefined {
    return this._index;
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  public get bound() {
    return this[$internal].bound;
  }

  $idx(index?: number): this {
    this._index = index;
    return this;
  }

  unwrap(unwrapper: Unwrapper) {
    const unwrapped = unwrapper.device.createBindGroupLayout({
      label: getName(this) ?? '<unnamed>',
      entries: Object.values(this.entries)
        .map((entry, idx) => {
          if (entry === null) {
            return null;
          }

          let visibility = entry.visibility;

          const binding: GPUBindGroupLayoutEntry = {
            binding: idx,
            visibility: 0,
          };

          if ('uniform' in entry) {
            visibility = visibility ?? DEFAULT_READONLY_VISIBILITY;

            binding.buffer = {
              type: 'uniform' as const,
            };
          } else if ('storage' in entry) {
            visibility = visibility ??
              (entry.access === 'mutable'
                ? DEFAULT_MUTABLE_VISIBILITY
                : DEFAULT_READONLY_VISIBILITY);

            binding.buffer = {
              type: entry.access === 'mutable'
                ? ('storage' as const)
                : ('read-only-storage' as const),
            };
          } else if ('sampler' in entry) {
            visibility = visibility ?? DEFAULT_READONLY_VISIBILITY;

            binding.sampler = {
              type: entry.sampler,
            };
          } else if ('texture' in entry) {
            visibility = visibility ?? DEFAULT_READONLY_VISIBILITY;
            const { multisampled, dimension, bindingSampleType } =
              entry.texture;
            binding.texture = {
              sampleType: entry.sampleType ?? bindingSampleType[0],
              viewDimension: dimension,
              multisampled,
            } satisfies Required<GPUTextureBindingLayout>;
          } else if ('storageTexture' in entry) {
            visibility = visibility ??
              DEFAULT_MUTABLE_VISIBILITY;
            const { dimension, access, format } = entry.storageTexture;
            binding.storageTexture = {
              access,
              format,
              viewDimension: dimension,
            } satisfies Required<GPUStorageTextureBindingLayout>;
          } else if ('externalTexture' in entry) {
            visibility = visibility ?? DEFAULT_READONLY_VISIBILITY;
            binding.externalTexture = {};
          }

          if (visibility?.includes('compute')) {
            binding.visibility |= GPUShaderStage.COMPUTE;
          }
          if (visibility?.includes('vertex')) {
            binding.visibility |= GPUShaderStage.VERTEX;
          }
          if (visibility?.includes('fragment')) {
            binding.visibility |= GPUShaderStage.FRAGMENT;
          }

          return binding;
        })
        .filter((v): v is Exclude<typeof v, null> => v !== null),
    });

    return unwrapped;
  }
}

export class TgpuBindGroupImpl<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<
    string,
    TgpuLayoutEntry | null
  >,
> implements TgpuBindGroup<Entries> {
  public readonly resourceType = 'bind-group' as const;

  constructor(
    public readonly layout: TgpuBindGroupLayout<Entries>,
    public readonly entries: ExtractBindGroupInputFromLayout<Entries>,
  ) {
    // Checking if all entries are present.
    for (const key of Object.keys(layout.entries)) {
      if (layout.entries[key] !== null && !(key in entries)) {
        throw new MissingBindingError(getName(layout), key);
      }
    }
  }

  public unwrap(unwrapper: Unwrapper): GPUBindGroup {
    const unwrapped = unwrapper.device.createBindGroup({
      label: getName(this.layout) ?? '<unnamed>',
      layout: unwrapper.unwrap(this.layout),
      entries: Object.entries(this.layout.entries)
        .map(([key, entry], idx) => {
          if (entry === null) {
            return null;
          }

          const value = this.entries[key as keyof typeof this.entries];

          if (value === undefined) {
            throw new Error(
              `'${key}' is a resource required to populate bind group layout '${
                getName(this.layout) ?? '<unnamed>'
              }'.`,
            );
          }

          if ('uniform' in entry) {
            let resource: GPUBufferBinding;

            if (isBuffer(value)) {
              if (!isUsableAsUniform(value)) {
                throw new NotUniformError(value);
              }
              resource = { buffer: unwrapper.unwrap(value) };
            } else {
              resource = { buffer: value as GPUBuffer };
            }

            return {
              binding: idx,
              resource,
            };
          }

          if ('storage' in entry) {
            let resource: GPUBufferBinding;

            if (isBuffer(value)) {
              if (!isUsableAsStorage(value)) {
                throw new NotStorageError(value);
              }
              resource = { buffer: unwrapper.unwrap(value) };
            } else {
              resource = { buffer: value as GPUBuffer };
            }

            return {
              binding: idx,
              resource,
            };
          }

          if ('texture' in entry) {
            let resource: GPUTextureView;
            if (isTexture(value)) {
              if (!isUsableAsSampled(value)) {
                throw new NotSampledError(value);
              }

              resource = unwrapper.unwrap(
                (value as TgpuTexture & SampledFlag).createView(entry.texture),
              );
            } else if (isTextureView(value)) {
              resource = unwrapper.unwrap(value);
            } else {
              resource = value as GPUTextureView;
            }

            return {
              binding: idx,
              resource,
            };
          }

          if ('storageTexture' in entry) {
            let resource: GPUTextureView;
            if (isTexture(value)) {
              if (!isUsableAsStorage(value)) {
                throw new NotStorageError(value);
              }

              resource = unwrapper.unwrap(
                (value as TgpuTexture & StorageFlag).createView(
                  entry.storageTexture,
                ),
              );
            } else if (isTextureView(value)) {
              resource = unwrapper.unwrap(value);
            } else {
              resource = value as GPUTextureView;
            }

            return {
              binding: idx,
              resource,
            };
          }

          if ('sampler' in entry) {
            if (isComparisonSampler(value) || isSampler(value)) {
              return {
                binding: idx,
                resource: unwrapper.unwrap(value as TgpuSampler),
              };
            }

            return {
              binding: idx,
              resource: value as GPUSampler,
            };
          }

          if ('externalTexture' in entry) {
            return {
              binding: idx,
              resource: value as GPUExternalTexture,
            };
          }

          throw new Error(
            `Malformed bind group entry: ${safeStringify(value)}`,
          );
        })
        .filter((v): v is Exclude<typeof v, null> => v !== null),
    });

    return unwrapped;
  }
}
