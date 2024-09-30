import type { TgpuNamable } from './namable';
import type { TgpuBuffer, Uniform } from './tgpuBuffer';
import type { TgpuBufferUsage } from './tgpuBufferUsage';
import type { TgpuSampler } from './tgpuSampler';
import type {
  AnyTgpuData,
  OmitProps,
  Prettify,
  TgpuShaderStage,
} from './types';

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
  readonly bound: {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
  };

  populate(
    entries: { [K in keyof Entries]: LayoutEntryToInput<Entries[K]> },
  ): TgpuBindGroup<this>;

  /**
   * Creates a raw WebGPU resource based on the typed descriptor.
   * NOTE: This creates a new resource every time, better to use `root.unwrap(...)` instead.
   * @param device The device for which the raw resource should be created
   */
  unwrap(device: GPUDevice): GPUBindGroupLayout;
}

export type LayoutEntryToInput<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ?
        | TgpuBufferUsage<T['uniform'], 'uniform'>
        | (TgpuBuffer<T['uniform']> & Uniform)
        | GPUBuffer
    : T extends TgpuLayoutSampler
      ? GPUSampler
      : never;

export type BindLayoutEntry<T extends TgpuLayoutEntry | null> =
  T extends TgpuLayoutUniform
    ? TgpuBufferUsage<T['uniform'], 'uniform'>
    : T extends TgpuLayoutStorage
      ? TgpuBufferUsage<
          T['storage'],
          T['access'] extends 'mutable' ? 'mutable' : 'readonly'
        >
      : T extends TgpuLayoutSampler
        ? TgpuSampler
        : never;

export type TgpuBindGroup<
  Layout extends TgpuBindGroupLayout<Record<string, TgpuLayoutEntry>>,
> = {
  readonly layout: Layout;
  unwrap: (device: GPUDevice) => GPUBindGroup;
};

export function bindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null>,
>(entries: Entries): TgpuBindGroupLayout<Prettify<OmitProps<Entries, null>>> {
  return createBindGroupLayout(entries);
}

export function isBindGroupLayout<T extends TgpuBindGroupLayout>(
  value: T | unknown,
): value is T {
  return (value as T).resourceType === 'bind-group-layout';
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

  public readonly bound = {} as {
    [K in keyof Entries]: BindLayoutEntry<Entries[K]>;
  };

  constructor(private readonly _entries: Entries) {
    for (const [key, value] of Object.entries(_entries)) {
      if (value === null) {
        // Skip
      } else if ('uniform' in value) {
        // const uniformUsage = new BufferUsage();
        // this.bound[key as keyof Entries] = value;
      }
    }
  }

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
      entries: Object.values(this._entries)
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
  ): TgpuBindGroup<this> {
    throw new Error('Method not implemented.');
  }
}
