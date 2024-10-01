import { NotUniformError } from './errors';
import type { TgpuNamable } from './namable';
import {
  type Storage,
  type TgpuBuffer,
  type Uniform,
  isBuffer,
  isUsableAsStorage,
  isUsableAsUniform,
} from './tgpuBuffer';
import {
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  type TgpuBufferUsage,
  isBufferUsage,
} from './tgpuBufferUsage';
import type { TgpuSampler } from './tgpuSampler';
import type { AnyTgpuData, OmitProps, TgpuShaderStage } from './types';
import type { Unwrapper } from './unwrapper';

// ----------
// Public API
// ----------

export type TgpuLayoutEntryBase = {
  /**
   * Limits this resource's visibility to specific shader stages.
   *
   * By default, each resource is visible to all shader stage types, but
   * depending on the underlying implementation, this may have performance implications.
   *
   * @default['compute', 'vertex', 'fragment']
   */
  visibility?: TgpuShaderStage[];
};

export type TgpuLayoutUniform = TgpuLayoutEntryBase & {
  uniform: AnyTgpuData;
};
export type TgpuLayoutStorage = TgpuLayoutEntryBase & {
  storage: AnyTgpuData;
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

  populate(
    entries: {
      [K in keyof OmitProps<Entries, null>]: LayoutEntryToInput<Entries[K]>;
    },
  ): TgpuBindGroup<Entries>;

  /**
   * Creates a raw WebGPU resource based on the typed descriptor.
   * NOTE: This creates a new resource every time, better to use `root.unwrap(...)` instead.
   * @param device The device for which the raw resource should be created
   */
  unwrap(device: GPUDevice): GPUBindGroupLayout;
}

type StorageUsageForEntry<T extends TgpuLayoutStorage> = T extends {
  access?: infer Access;
} // Is the access defined on the type?
  ? 'mutable' | 'readonly' extends Access // Is the access ambiguous?
    ? TgpuBufferReadonly<T['storage']> | TgpuBufferMutable<T['storage']>
    : 'readonly' extends Access // Is the access strictly 'readonly'?
      ? TgpuBufferReadonly<T['storage']>
      : 'mutable' extends Access // Is the access strictly 'mutable'?
        ? TgpuBufferMutable<T['storage']>
        : TgpuBufferReadonly<T['storage']> | TgpuBufferMutable<T['storage']>
  : TgpuBufferReadonly<T['storage']>; // <- access is undefined, so default to 'readonly';

export type LayoutEntryToInput<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ?
        | TgpuBufferUsage<T['uniform'], 'uniform'>
        | (TgpuBuffer<T['uniform']> & Uniform)
        | GPUBuffer
    : T extends TgpuLayoutStorage
      ?
          | StorageUsageForEntry<T>
          | (TgpuBuffer<T['storage']> & Storage)
          | GPUBuffer
      : T extends TgpuLayoutSampler
        ? GPUSampler
        : never;

export type BindLayoutEntry<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ? TgpuBufferUniform<T['uniform']>
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

export function bindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null>,
>(entries: Entries): TgpuBindGroupLayout<Entries> {
  return createBindGroupLayout(entries);
}

export function isBindGroupLayout<T extends TgpuBindGroupLayout>(
  value: T | unknown,
): value is T {
  return (value as T).resourceType === 'bind-group-layout';
}

export function isBindGroup<T extends TgpuBindGroup>(
  value: T | unknown,
): value is T {
  return (value as T).resourceType === 'bind-group';
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

const DEFAULT_VISIBILITY = ['compute', 'vertex', 'fragment'];

function createBindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null>,
>(entries: Entries): TgpuBindGroupLayout<Entries> {
  return new TgpuBindGroupLayoutImpl(entries);
}

class TgpuBindGroupLayoutImpl<
  Entries extends Record<string, TgpuLayoutEntry | null>,
> implements TgpuBindGroupLayout<Entries>
{
  private _label: string | undefined;

  public readonly resourceType = 'bind-group-layout' as const;

  // TODO: Fill bound values.
  public readonly bound = {} as {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
  };

  constructor(public readonly entries: Entries) {}

  get label() {
    return this._label;
  }

  $name(label?: string | undefined): this {
    this._label = label;
    return this;
  }

  unwrap(device: GPUDevice) {
    const unwrapped = device.createBindGroupLayout({
      label: this.label ?? '',
      entries: Object.values(this.entries)
        .map((entry, idx) => {
          if (entry === null) {
            return null;
          }

          const visibility = entry.visibility ?? DEFAULT_VISIBILITY;

          let visibilityFlags = 0;
          if (visibility.includes('compute')) {
            visibilityFlags |= GPUShaderStage.COMPUTE;
          }
          if (visibility.includes('vertex')) {
            visibilityFlags |= GPUShaderStage.VERTEX;
          }
          if (visibility.includes('fragment')) {
            visibilityFlags |= GPUShaderStage.FRAGMENT;
          }

          if ('uniform' in entry) {
            return {
              binding: idx,
              visibility: visibilityFlags,
              buffer: {
                type: 'uniform' as const,
              },
            };
          }

          if ('storage' in entry) {
            return {
              binding: idx,
              visibility: visibilityFlags,
              buffer: {
                type:
                  entry.access === 'mutable'
                    ? ('storage' as const)
                    : ('read-only-storage' as const),
              },
            };
          }

          if ('sampler' in entry) {
            return {
              binding: idx,
              visibility: visibilityFlags,
              sampler: {
                type: entry.sampler,
              },
            };
          }

          if ('texture' in entry) {
            return {
              binding: idx,
              visibility: visibilityFlags,
              texture: {
                sampleType: entry.texture,
                viewDimension: entry.viewDimension ?? '2d',
                multisampled: entry.multisampled ?? false,
              },
            };
          }

          if ('storageTexture' in entry) {
            const access = entry.access ?? 'writeonly';

            return {
              binding: idx,
              visibility: visibilityFlags,
              storageTexture: {
                format: entry.storageTexture,
                access: {
                  mutable: 'read-write' as const,
                  readonly: 'read-only' as const,
                  writeonly: 'write-only' as const,
                }[access],
                viewDimension: entry.viewDimension ?? '2d',
              },
            };
          }

          if ('externalTexture' in entry) {
            return {
              binding: idx,
              visibility: visibilityFlags,
              externalTexture: {},
            };
          }

          throw new Error(
            `Unknown bind group layout entry type: ${JSON.stringify(entry)}`,
          );
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
            } else if (isBufferUsage(value)) {
              if (!isUsableAsUniform(value.allocatable)) {
                throw new NotUniformError(value.allocatable);
              }
              resource = { buffer: unwrapper.unwrap(value.allocatable) };
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
            } else if (isBufferUsage(value)) {
              if (!isUsableAsStorage(value.allocatable)) {
                throw new NotUniformError(value.allocatable);
              }
              resource = { buffer: unwrapper.unwrap(value.allocatable) };
            } else {
              resource = { buffer: value as GPUBuffer };
            }

            return {
              binding: idx,
              resource,
            };
          }

          if (
            'texture' in entry ||
            'storageTexture' in entry ||
            'sampler' in entry ||
            'externalTexture' in entry
          ) {
            return {
              binding: idx,
              resource: value as GPUSampler,
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
