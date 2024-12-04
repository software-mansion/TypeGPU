import {
  type TgpuBuffer,
  type Uniform,
  isBuffer,
  isUsableAsUniform,
} from './core/buffer/buffer';
import {
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  TgpuLaidOutBufferImpl,
} from './core/buffer/bufferUsage';
import {
  type TgpuMutableTexture,
  type TgpuReadonlyTexture,
  type TgpuSampledTexture,
  type TgpuTexture,
  isTexture,
} from './core/texture/texture';
import {
  NotSampledError,
  isUsableAsSampled,
} from './core/texture/usageExtension';
import type { Exotic } from './data/exotic';
import type { BaseWgslData } from './data/wgslTypes';
import { NotUniformError } from './errors';
import { NotStorageError, type Storage, isUsableAsStorage } from './extension';
import type { TgpuNamable } from './namable';
import type { OmitProps, Prettify } from './shared/utilityTypes';
import type { TgpuSampler } from './tgpuSampler';
import type { TgpuShaderStage } from './types';
import type { Unwrapper } from './unwrapper';

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
  uniform: BaseWgslData | ((arrayLength: number) => BaseWgslData);
};

export type TgpuLayoutStorage = TgpuLayoutEntryBase & {
  storage: BaseWgslData | ((arrayLength: number) => BaseWgslData);
  /** @default 'readonly' */
  access?: 'mutable' | 'readonly';
};

export type TgpuLayoutSampler = TgpuLayoutEntryBase & {
  sampler: GPUSamplerBindingType;
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
  TFormat extends GPUTextureFormat = GPUTextureFormat,
> = TgpuLayoutEntryBase & {
  storageTexture: TFormat;
  /** @default 'writeonly' */
  access?: 'readonly' | 'writeonly' | 'mutable';
  /** @default '2d' */
  viewDimension?: GPUTextureViewDimension;
};
export type TgpuLayoutExternalTexture = TgpuLayoutEntryBase & {
  externalTexture: Record<string, never>;
};

export type TgpuLayoutEntry =
  | TgpuLayoutUniform
  | TgpuLayoutStorage
  | TgpuLayoutSampler
  | TgpuLayoutTexture
  | TgpuLayoutStorageTexture
  | TgpuLayoutExternalTexture;

type UnwrapRuntimeConstructorInner<
  T extends BaseWgslData | ((_: number) => BaseWgslData),
> = T extends BaseWgslData
  ? T
  : T extends (_: number) => infer Return
    ? Return
    : never;

export type UnwrapRuntimeConstructor<
  T extends BaseWgslData | ((_: number) => BaseWgslData),
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

  /**
   * An explicit numeric index assigned to this bind group layout. If undefined, a unique
   * index is assigned automatically during resolution. This can be changed with the
   * `.$idx()` method.
   */
  readonly index: number | undefined;

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

export interface TgpuBindGroupLayoutExperimental<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<
    string,
    TgpuLayoutEntry | null
  >,
> extends TgpuBindGroupLayout<Entries> {
  /**
   * Associates this bind group layout with an explicit numeric index. When a call to this
   * method is omitted, a unique numeric index is assigned to it automatically.
   *
   * Used when generating WGSL code: `@group(${index}) @binding(...) ...;`
   */
  $idx(index?: number): this;
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
  T extends TgpuLayoutUniform
    ? (TgpuBuffer<UnwrapRuntimeConstructor<T['uniform']>> & Uniform) | GPUBuffer
    : T extends TgpuLayoutStorage
      ?
          | (TgpuBuffer<UnwrapRuntimeConstructor<T['storage']>> & Storage)
          | GPUBuffer
      : T extends TgpuLayoutSampler
        ? GPUSampler
        : T extends TgpuLayoutTexture
          ? // TODO: Allow sampled usages here
            GPUTextureView | TgpuTexture
          : T extends TgpuLayoutStorageTexture
            ? // TODO: Allow storage usages here
              GPUTextureView | TgpuTexture
            : T extends TgpuLayoutExternalTexture
              ? GPUExternalTexture
              : never;

export type BindLayoutEntry<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ? TgpuBufferUniform<UnwrapRuntimeConstructor<T['uniform']>>
    : T extends TgpuLayoutStorage
      ? StorageUsageForEntry<T>
      : T extends TgpuLayoutSampler
        ? TgpuSampler
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

type ExoticEntry<T> = T extends Record<string | number | symbol, unknown>
  ? {
      [Key in keyof T]: T[Key] extends BaseWgslData
        ? Exotic<T[Key]>
        : T[Key] extends (...args: infer TArgs) => infer TReturn
          ? (...args: TArgs) => Exotic<TReturn>
          : T[Key];
    }
  : T;

type ExoticEntries<T extends Record<string, TgpuLayoutEntry | null>> = {
  [BindingKey in keyof T]: ExoticEntry<T[BindingKey]>;
};

export function bindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null>,
>(entries: Entries): TgpuBindGroupLayout<Prettify<ExoticEntries<Entries>>> {
  return new TgpuBindGroupLayoutImpl(entries as ExoticEntries<Entries>);
}

export function bindGroupLayoutExperimental<
  Entries extends Record<string, TgpuLayoutEntry | null>,
>(
  entries: Entries,
): TgpuBindGroupLayoutExperimental<Prettify<ExoticEntries<Entries>>> {
  return new TgpuBindGroupLayoutImpl(entries as ExoticEntries<Entries>);
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
> implements TgpuBindGroupLayoutExperimental<Entries>
{
  private _label: string | undefined;
  private _index: number | undefined;

  public readonly resourceType = 'bind-group-layout' as const;

  public readonly bound = {} as {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
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
        const dataType =
          'type' in entry.uniform ? entry.uniform : entry.uniform(0);

        // biome-ignore lint/suspicious/noExplicitAny: <no need for type magic>
        (this.bound[key] as any) = new TgpuLaidOutBufferImpl(
          'uniform',
          dataType,
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

      idx++;
    }
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
      label: this.label ?? '',
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

class TgpuBindGroupImpl<
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
      label: this.layout.label ?? '',
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

          if ('texture' in entry) {
            let resource: GPUTextureView;

            if (isTexture(value)) {
              if (!isUsableAsSampled(value)) {
                throw new NotSampledError(value);
              }

              resource = unwrapper.unwrap(
                value.asSampled() as TgpuSampledTexture,
              );
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
                  value.asReadonly() as TgpuReadonlyTexture,
                );
              } else if (entry.access === 'mutable') {
                resource = unwrapper.unwrap(
                  value.asMutable() as TgpuMutableTexture,
                );
              } else {
                resource = unwrapper.unwrap(
                  value.asReadonly() as TgpuReadonlyTexture,
                );
              }
            } else {
              resource = value as GPUTextureView;
            }

            return {
              binding: idx,
              resource,
            };
          }

          if ('externalTexture' in entry || 'sampler' in entry) {
            return {
              binding: idx,
              resource: value as GPUExternalTexture | GPUSampler,
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
