import {
  type TgpuBuffer,
  type UniformFlag,
  isBuffer,
} from './core/buffer/buffer.ts';
import {
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  TgpuLaidOutBufferImpl,
  isUsableAsUniform,
} from './core/buffer/bufferUsage.ts';
import {
  type TgpuComparisonSampler,
  TgpuLaidOutComparisonSamplerImpl,
  TgpuLaidOutSamplerImpl,
  type TgpuSampler,
  isComparisonSampler,
  isSampler,
} from './core/sampler/sampler.ts';
import { TgpuExternalTextureImpl } from './core/texture/externalTexture.ts';
import {
  type StorageTextureDimension,
  TgpuLaidOutSampledTextureImpl,
  TgpuLaidOutStorageTextureImpl,
  type TgpuMutableTexture,
  type TgpuReadonlyTexture,
  type TgpuSampledTexture,
  type TgpuTexture,
  type TgpuWriteonlyTexture,
  isSampledTextureView,
  isStorageTextureView,
  isTexture,
} from './core/texture/texture.ts';
import type {
  SampleTypeToStringChannelType,
  ViewDimensionToDimension,
} from './core/texture/textureFormats.ts';
import type {
  ChannelFormatToSchema,
  ChannelTypeToLegalFormats,
  StorageTextureTexelFormat,
  TexelFormatToDataType,
} from './core/texture/textureFormats.ts';
import type { TextureProps } from './core/texture/textureProps.ts';
import {
  NotSampledError,
  type Sampled,
  isUsableAsSampled,
} from './core/texture/usageExtension.ts';
import type { AnyData } from './data/dataTypes.ts';
import type { AnyWgslData, BaseData } from './data/wgslTypes.ts';
import { NotUniformError } from './errors.ts';
import {
  NotStorageError,
  type StorageFlag,
  isUsableAsStorage,
} from './extension.ts';
import type { TgpuNamable } from './namable.ts';
import type { Infer } from './shared/repr.ts';
import type { Default, OmitProps, Prettify } from './shared/utilityTypes.ts';
import type { TgpuShaderStage } from './types.ts';
import type { Unwrapper } from './unwrapper.ts';

// ----------
// Public API
// ----------

export type LayoutMembership = {
  layout: TgpuBindGroupLayout;
  key: string;
  idx: number;
};

export type TgpuLayoutEntryBase = {
  /**
   * Limits this resource's visibility to specific shader stages.
   *
   * By default, each resource is visible to all shader stage types, but
   * depending on the underlying implementation, this may have performance implications.
   *
   * @default ['compute'] for mutable resources
   * @default ['compute','vertex','fragment'] for everything else
   */
  visibility?: TgpuShaderStage[];
};

export type TgpuLayoutUniform = TgpuLayoutEntryBase & {
  uniform: AnyWgslData;
};

export type TgpuLayoutStorage = TgpuLayoutEntryBase & {
  storage: AnyWgslData | ((arrayLength: number) => AnyWgslData);
  /** @default 'readonly' */
  access?: 'mutable' | 'readonly';
};

export type TgpuLayoutSampler = TgpuLayoutEntryBase & {
  sampler: 'filtering' | 'non-filtering';
};

export type TgpuLayoutComparisonSampler = TgpuLayoutEntryBase & {
  sampler: 'comparison';
};

export type TgpuLayoutTexture<
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
export type TgpuLayoutStorageTexture<
  TFormat extends StorageTextureTexelFormat = StorageTextureTexelFormat,
> = TgpuLayoutEntryBase & {
  storageTexture: TFormat;
  /** @default 'writeonly' */
  access?: 'readonly' | 'writeonly' | 'mutable';
  /** @default '2d' */
  viewDimension?: StorageTextureDimension;
};
export type TgpuLayoutExternalTexture = TgpuLayoutEntryBase & {
  externalTexture: Record<string, never>;
};

export type TgpuLayoutEntry =
  | TgpuLayoutUniform
  | TgpuLayoutStorage
  | TgpuLayoutSampler
  | TgpuLayoutComparisonSampler
  | TgpuLayoutTexture
  | TgpuLayoutStorageTexture
  | TgpuLayoutExternalTexture;

type UnwrapRuntimeConstructorInner<
  T extends BaseData | ((_: number) => BaseData),
> = T extends (_: number) => BaseData ? ReturnType<T> : T;

export type UnwrapRuntimeConstructor<
  T extends AnyData | ((_: number) => AnyData),
> = T extends unknown ? UnwrapRuntimeConstructorInner<T> : never;

export interface TgpuBindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<
    string,
    TgpuLayoutEntry | null
  >,
> extends TgpuNamable {
  readonly resourceType: 'bind-group-layout';
  readonly label: string | undefined;
  readonly entries: Entries;
  readonly bound: {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
  };
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
   * @deprecated Use the `root.createBindGroup` API instead, accessible through `await tgpu.init()`
   */
  populate(
    entries: {
      [K in keyof OmitProps<Entries, null>]: LayoutEntryToInput<Entries[K]>;
    },
  ): TgpuBindGroup<Entries>;

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

type GetUsageForStorageTexture<
  T extends TgpuLayoutStorageTexture,
  TAccess extends 'readonly' | 'writeonly' | 'mutable',
> = {
  mutable: TgpuMutableTexture<
    Default<GetDimension<T['viewDimension']>, '2d'>,
    TexelFormatToDataType[T['storageTexture']]
  >;
  readonly: TgpuReadonlyTexture<
    Default<GetDimension<T['viewDimension']>, '2d'>,
    TexelFormatToDataType[T['storageTexture']]
  >;
  writeonly: TgpuWriteonlyTexture<
    Default<GetDimension<T['viewDimension']>, '2d'>,
    TexelFormatToDataType[T['storageTexture']]
  >;
}[TAccess];

type StorageTextureUsageForEntry<T extends TgpuLayoutStorageTexture> =
  T extends unknown
    ? GetUsageForStorageTexture<T, Default<T['access'], 'writeonly'>>
    : never;

type GetDimension<T extends GPUTextureViewDimension | undefined> =
  T extends keyof ViewDimensionToDimension
    ? ViewDimensionToDimension[T]
    : undefined;

type GetTextureRestriction<T extends TgpuLayoutTexture> = Default<
  GetDimension<T['viewDimension']>,
  '2d'
> extends infer Dimension
  ? Dimension extends '2d'
    ? {
        format: ChannelTypeToLegalFormats[SampleTypeToStringChannelType[T['texture']]];
        dimension?: Dimension;
      }
    : {
        format: ChannelTypeToLegalFormats[SampleTypeToStringChannelType[T['texture']]];
        dimension: Dimension;
      }
  : never;

type GetStorageTextureRestriction<T extends TgpuLayoutStorageTexture> = Default<
  GetDimension<T['viewDimension']>,
  '2d'
> extends infer Dimension
  ? Dimension extends '2d'
    ? {
        format: T['storageTexture'];
        dimension?: Dimension;
      }
    : {
        format: T['storageTexture'];
        dimension: Dimension;
      }
  : never;

export type LayoutEntryToInput<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ?
        | (TgpuBuffer<UnwrapRuntimeConstructor<T['uniform']>> & UniformFlag)
        | GPUBuffer
    : T extends TgpuLayoutStorage
      ?
          | (TgpuBuffer<UnwrapRuntimeConstructor<T['storage']>> & StorageFlag)
          | GPUBuffer
      : T extends TgpuLayoutSampler
        ? TgpuSampler | GPUSampler
        : T extends TgpuLayoutComparisonSampler
          ? TgpuComparisonSampler | GPUSampler
          : T extends TgpuLayoutTexture
            ?
                | GPUTextureView
                | (Sampled &
                    TgpuTexture<
                      Prettify<TextureProps & GetTextureRestriction<T>>
                    >)
                | TgpuSampledTexture<
                    Default<T['viewDimension'], '2d'>,
                    ChannelFormatToSchema[T['texture']]
                  >
            : T extends TgpuLayoutStorageTexture
              ?
                  | GPUTextureView
                  | (StorageFlag &
                      TgpuTexture<
                        Prettify<TextureProps & GetStorageTextureRestriction<T>>
                      >)
                  | StorageTextureUsageForEntry<T>
              : T extends TgpuLayoutExternalTexture
                ? GPUExternalTexture
                : never;

export type BindLayoutEntry<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ? TgpuBufferUniform<T['uniform']>
    : T extends TgpuLayoutStorage
      ? StorageUsageForEntry<T>
      : T extends TgpuLayoutSampler
        ? TgpuSampler
        : T extends TgpuLayoutComparisonSampler
          ? TgpuComparisonSampler
          : T extends TgpuLayoutTexture
            ? TgpuSampledTexture<
                Default<GetDimension<T['viewDimension']>, '2d'>,
                ChannelFormatToSchema[T['texture']]
              >
            : T extends TgpuLayoutStorageTexture
              ? StorageTextureUsageForEntry<T>
              : never;

export type InferLayoutEntry<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ? Infer<T['uniform']>
    : T extends TgpuLayoutStorage
      ? Infer<UnwrapRuntimeConstructor<T['storage']>>
      : T extends TgpuLayoutSampler
        ? TgpuSampler
        : T extends TgpuLayoutComparisonSampler
          ? TgpuComparisonSampler
          : T extends TgpuLayoutTexture
            ? TgpuSampledTexture<
                Default<GetDimension<T['viewDimension']>, '2d'>,
                ChannelFormatToSchema[T['texture']]
              >
            : T extends TgpuLayoutStorageTexture
              ? StorageTextureUsageForEntry<T>
              : never;

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
>(entries: Entries): TgpuBindGroupLayout<Prettify<Entries>> {
  return new TgpuBindGroupLayoutImpl(entries);
}

export function isBindGroupLayout<T extends TgpuBindGroupLayout>(
  value: T | unknown,
): value is T {
  return !!value && (value as T).resourceType === 'bind-group-layout';
}

export function isBindGroup<T extends TgpuBindGroup>(
  value: T | unknown,
): value is T {
  return !!value && (value as T).resourceType === 'bind-group';
}

/**
 * @category Errors
 */
export class MissingBindingError extends Error {
  constructor(groupLabel: string | undefined, key: string) {
    super(
      `Bind group '${groupLabel ?? '<unnamed>'}' is missing a required binding '${key}'`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindingError.prototype);
  }
}

// --------------
// Implementation
// --------------

const DEFAULT_MUTABLE_VISIBILITY: TgpuShaderStage[] = ['compute'];
const DEFAULT_READONLY_VISIBILITY: TgpuShaderStage[] = [
  'compute',
  'vertex',
  'fragment',
];

class TgpuBindGroupLayoutImpl<
  Entries extends Record<string, TgpuLayoutEntry | null>,
> implements TgpuBindGroupLayout<Entries>
{
  private _label: string | undefined;
  private _index: number | undefined;

  public readonly resourceType = 'bind-group-layout' as const;

  public readonly bound = {} as {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
  };

  public readonly value = {} as {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };

  public readonly $ = this.value as {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };

  constructor(public readonly entries: Entries) {
    let idx = 0;

    for (const [key, entry] of Object.entries(entries)) {
      if (entry === null) {
        idx++;
        continue;
      }

      const membership = { idx, key, layout: this };

      if ('uniform' in entry) {
        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.bound[key] as any) = new TgpuLaidOutBufferImpl(
          'uniform',
          entry.uniform,
          membership,
        );
      }

      if ('storage' in entry) {
        const dataType =
          'type' in entry.storage ? entry.storage : entry.storage(0);

        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.bound[key] as any) = new TgpuLaidOutBufferImpl(
          entry.access ?? 'readonly',
          dataType,
          membership,
        );
      }

      if ('texture' in entry) {
        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.bound[key] as any) = new TgpuLaidOutSampledTextureImpl(
          entry.texture,
          entry.viewDimension ?? '2d',
          entry.multisampled ?? false,
          membership,
        );
      }

      if ('storageTexture' in entry) {
        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.bound[key] as any) = new TgpuLaidOutStorageTextureImpl(
          entry.storageTexture,
          entry.viewDimension ?? '2d',
          entry.access ?? 'writeonly',
          membership,
        );
      }

      if ('externalTexture' in entry) {
        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.bound[key] as any) = new TgpuExternalTextureImpl(membership);
      }

      if ('sampler' in entry) {
        if (entry.sampler === 'comparison') {
          // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
          (this.bound[key] as any) = new TgpuLaidOutComparisonSamplerImpl(
            membership,
          );
        } else {
          // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
          (this.bound[key] as any) = new TgpuLaidOutSamplerImpl(membership);
        }
      }

      if (
        'texture' in entry ||
        'storageTexture' in entry ||
        'externalTexture' in entry ||
        'sampler' in entry
      ) {
        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.value as any)[key] = this.bound[key];
      } else {
        Object.defineProperty(this.value, key, {
          get: () => {
            // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
            return (this.bound[key] as any).value;
          },
        });
      }

      idx++;
    }
  }

  toString(): string {
    return `bindGroupLayout:${this._label ?? '<unnamed>'}`;
  }

  get label(): string | undefined {
    return this._label;
  }

  get index(): number | undefined {
    return this._index;
  }

  $name(label?: string | undefined): this {
    this._label = label;
    return this;
  }

  $idx(index?: number): this {
    this._index = index;
    return this;
  }

  unwrap(unwrapper: Unwrapper) {
    const unwrapped = unwrapper.device.createBindGroupLayout({
      label: this.label ?? '<unnamed>',
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
            visibility =
              visibility ??
              (entry.access === 'mutable'
                ? DEFAULT_MUTABLE_VISIBILITY
                : DEFAULT_READONLY_VISIBILITY);

            binding.buffer = {
              type:
                entry.access === 'mutable'
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

            binding.texture = {
              sampleType: entry.texture,
              viewDimension: entry.viewDimension ?? '2d',
              multisampled: entry.multisampled ?? false,
            };
          } else if ('storageTexture' in entry) {
            const access = entry.access ?? 'writeonly';

            visibility =
              visibility ??
              (access === 'readonly'
                ? DEFAULT_READONLY_VISIBILITY
                : DEFAULT_MUTABLE_VISIBILITY);

            binding.storageTexture = {
              format: entry.storageTexture,
              access: {
                mutable: 'read-write' as const,
                readonly: 'read-only' as const,
                writeonly: 'write-only' as const,
              }[access],
              viewDimension: entry.viewDimension ?? '2d',
            };
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

  populate(
    entries: { [K in keyof Entries]: LayoutEntryToInput<Entries[K]> },
  ): TgpuBindGroup<Entries> {
    return new TgpuBindGroupImpl(this, entries);
  }
}

export class TgpuBindGroupImpl<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<
    string,
    TgpuLayoutEntry | null
  >,
> implements TgpuBindGroup<Entries>
{
  public readonly resourceType = 'bind-group' as const;

  constructor(
    public readonly layout: TgpuBindGroupLayout<Entries>,
    public readonly entries: {
      [K in keyof Entries]: LayoutEntryToInput<Entries[K]>;
    },
  ) {
    // Checking if all entries are present.
    for (const key of Object.keys(layout.entries)) {
      if (layout.entries[key] !== null && !(key in entries)) {
        throw new MissingBindingError(layout.label, key);
      }
    }
  }

  public unwrap(unwrapper: Unwrapper): GPUBindGroup {
    const unwrapped = unwrapper.device.createBindGroup({
      label: this.layout.label ?? '<unnamed>',
      layout: unwrapper.unwrap(this.layout),
      entries: Object.entries(this.layout.entries)
        .map(([key, entry], idx) => {
          if (entry === null) {
            return null;
          }

          const value = this.entries[key];

          if (value === undefined) {
            throw new Error(
              `'${key}' is a resource required to populate bind group layout '${this.layout.label ?? '<unnamed>'}'.`,
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
                (value as TgpuTexture & Sampled).createView('sampled'),
              );
            } else if (isSampledTextureView(value)) {
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

              if (entry.access === 'readonly') {
                resource = unwrapper.unwrap(
                  (value as TgpuTexture & StorageFlag).createView('readonly'),
                );
              } else if (entry.access === 'mutable') {
                resource = unwrapper.unwrap(
                  (value as TgpuTexture & StorageFlag).createView('mutable'),
                );
              } else {
                resource = unwrapper.unwrap(
                  (value as TgpuTexture & StorageFlag).createView('writeonly'),
                );
              }
            } else if (isStorageTextureView(value)) {
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
            if (isSampler(value) || isComparisonSampler(value)) {
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
            `Malformed bind group entry: ${value} (${JSON.stringify(value)})`,
          );
        })
        .filter((v): v is Exclude<typeof v, null> => v !== null),
    });

    return unwrapped;
  }
}
