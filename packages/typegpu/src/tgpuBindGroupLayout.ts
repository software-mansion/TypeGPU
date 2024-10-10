import {
  type Storage,
  type TgpuBuffer,
  type Uniform,
  isBuffer,
  isUsableAsStorage,
  isUsableAsUniform,
} from './core/buffer/buffer';
import {
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  type TgpuBufferUsage,
  isBufferUsage,
} from './core/buffer/bufferUsage';
import { NotUniformError } from './errors';
import type { TgpuNamable } from './namable';
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
   * @default ['compute'] for mutable resources
   * @default ['compute','vertex','fragment'] for everything else
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
   * @param unwrapper Used to unwrap any resources that this resource depends on.
   */
  unwrap(unwrapper: Unwrapper): GPUBindGroupLayout;
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
        : T extends TgpuLayoutTexture
          ? GPUTextureView
          : T extends TgpuLayoutStorageTexture
            ? GPUTextureView
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
            'externalTexture' in entry ||
            'sampler' in entry
          ) {
            return {
              binding: idx,
              resource: value as
                | GPUTextureView
                | GPUExternalTexture
                | GPUSampler,
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
