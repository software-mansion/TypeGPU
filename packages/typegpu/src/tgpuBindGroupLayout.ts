import { type TgpuBuffer, type UniformFlag } from './core/buffer/buffer.ts';
import { isBuffer, isUsableAsStorage, isUsableAsUniform } from './types.ts';
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
import { TgpuExternalTextureImpl } from './core/texture/externalTexture.ts';
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
import {
  type WgslExternalTexture,
  type WgslStorageTexture,
  type WgslTexture,
} from './data/texture.ts';
import type { AnyWgslData, BaseData } from './data/wgslTypes.ts';
import { invariant, NotUniformError } from './errors.ts';
import { NotStorageError, type StorageFlag } from './extension.ts';
import type { TgpuNamable } from './shared/meta.ts';
import { getName, setName } from './shared/meta.ts';
import type { InferGPU, MemIdentity } from './shared/repr.ts';
import { safeStringify } from './shared/stringify.ts';
import { $gpuValueOf, $internal } from './shared/symbols.ts';
import type { NullableToOptional, Prettify } from './shared/utilityTypes.ts';
import type { ResolvableObject, TgpuShaderStage } from './types.ts';
import type { Unwrapper } from './unwrapper.ts';
import type { WgslComparisonSampler, WgslSampler } from './data/sampler.ts';
import { TgpuLaidOutBufferImpl } from './core/buffer/laidOutBuffer.ts';
import {
  isMutableBinding,
  isReadonlyBinding,
  isUniformBinding,
  type TgpuBufferBinding,
  type TgpuMutable,
  type TgpuReadonly,
  type TgpuUniform,
} from './core/buffer/bufferBinding.ts';
import type { AnyData } from './data/dataTypes.ts';

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

export type TgpuLayoutTexture<TSchema extends WgslTexture = WgslTexture> = TgpuLayoutEntryBase & {
  texture: TSchema;
  sampleType?: GPUTextureSampleType;
};

export type TgpuLayoutStorageTexture<TSchema extends WgslStorageTexture = WgslStorageTexture> =
  TgpuLayoutEntryBase & {
    storageTexture: TSchema;
  };

export type TgpuLayoutExternalTexture = TgpuLayoutEntryBase & {
  externalTexture: WgslExternalTexture;
};

export type TgpuLayoutEntry =
  | TgpuLayoutUniform
  | TgpuLayoutStorage
  | TgpuLayoutSampler
  | TgpuLayoutComparisonSampler
  | TgpuLayoutTexture
  | TgpuLayoutStorageTexture
  | TgpuLayoutExternalTexture;

type UnwrapRuntimeConstructorInner<T extends BaseData | ((_: number) => BaseData)> = T extends (
  _: number,
) => BaseData
  ? ReturnType<T>
  : T;

export type UnwrapRuntimeConstructor<T extends BaseData | ((_: number) => BaseData)> =
  T extends unknown ? UnwrapRuntimeConstructorInner<T> : never;

export interface TgpuBindGroupLayout<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<string, TgpuLayoutEntry | null>,
> extends TgpuNamable {
  readonly [$internal]: ResolvableObject[];
  readonly resourceType: 'bind-group-layout';
  readonly entries: Entries;
  readonly [$gpuValueOf]: {
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

export type LayoutEntryToInput<T extends TgpuLayoutEntry | null> =
  // Widest type
  TgpuLayoutEntry | null extends T
    ?
        | TgpuBuffer<AnyWgslData> // TODO: investigate
        | TgpuBufferBinding<AnyData>
        | GPUBuffer
        | TgpuSampler
        | GPUSampler
        | TgpuComparisonSampler
        | TgpuTexture
        | GPUTextureView
        | GPUExternalTexture
    : // Strict type-checking
      T extends TgpuLayoutUniform
      ?
          | (TgpuBuffer<MemIdentity<UnwrapRuntimeConstructor<T['uniform']>>> & UniformFlag)
          | TgpuUniform<MemIdentity<UnwrapRuntimeConstructor<T['uniform']>>>
          | GPUBuffer
      : T extends TgpuLayoutStorage
        ?
            | (TgpuBuffer<MemIdentity<UnwrapRuntimeConstructor<T['storage']>>> & StorageFlag)
            | (T extends { access: 'mutable' }
                ? TgpuMutable<MemIdentity<UnwrapRuntimeConstructor<T['storage']>>>
                : TgpuReadonly<MemIdentity<UnwrapRuntimeConstructor<T['storage']>>>)
            | GPUBuffer
        : T extends TgpuLayoutSampler
          ? TgpuSampler | GPUSampler
          : T extends TgpuLayoutComparisonSampler
            ? TgpuComparisonSampler | GPUSampler
            : T extends TgpuLayoutTexture
              ?
                  | GPUTextureView
                  | GPUTexture
                  | (SampledFlag & TgpuTexture<Prettify<PropsForSchema<T['texture']>>>)
                  | TgpuTextureView<WgslTexture>
              : T extends TgpuLayoutStorageTexture
                ?
                    | GPUTextureView
                    | GPUTexture
                    | (StorageFlag & TgpuTexture<Prettify<PropsForSchema<T['storageTexture']>>>)
                    | TgpuTextureView<WgslStorageTexture>
                : T extends TgpuLayoutExternalTexture
                  ? GPUExternalTexture
                  : never;

export type InferLayoutEntry<T extends TgpuLayoutEntry | null> = T extends TgpuLayoutUniform
  ? InferGPU<T['uniform']>
  : T extends TgpuLayoutStorage
    ? InferGPU<UnwrapRuntimeConstructor<T['storage']>>
    : T extends TgpuLayoutSampler
      ? InferGPU<WgslSampler>
      : T extends TgpuLayoutComparisonSampler
        ? InferGPU<WgslComparisonSampler>
        : T extends TgpuLayoutTexture<infer TSchema>
          ? InferGPU<TSchema>
          : T extends TgpuLayoutStorageTexture<infer TSchema>
            ? InferGPU<TSchema>
            : T extends TgpuLayoutExternalTexture
              ? InferGPU<T['externalTexture']>
              : never;

export type ExtractBindGroupInputFromLayout<T extends Record<string, TgpuLayoutEntry | null>> =
  NullableToOptional<{ [K in keyof T]: LayoutEntryToInput<T[K]> }>;

export type TgpuBindGroup<
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<string, TgpuLayoutEntry | null>,
> = {
  readonly resourceType: 'bind-group';
  readonly layout: TgpuBindGroupLayout<Entries>;
  unwrap(unwrapper: Unwrapper): GPUBindGroup;
};

export function bindGroupLayout<Entries extends Record<string, TgpuLayoutEntry | null>>(
  entries: Entries,
): TgpuBindGroupLayout<Prettify<Entries>> {
  return new TgpuBindGroupLayoutImpl({ ...entries } as Prettify<Entries>);
}

export function isBindGroupLayout(value: unknown): value is TgpuBindGroupLayout {
  return !!value && (value as TgpuBindGroupLayout).resourceType === 'bind-group-layout';
}

export function isBindGroup(value: unknown): value is TgpuBindGroup {
  return !!value && (value as TgpuBindGroup).resourceType === 'bind-group';
}

/**
 * @category Errors
 */
export class MissingBindingError extends Error {
  constructor(groupLabel: string | undefined, key: string) {
    super(`Bind group '${groupLabel ?? '<unnamed>'}' is missing a required binding '${key}'`);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, MissingBindingError.prototype);
  }
}

// --------------
// Implementation
// --------------

const DEFAULT_MUTABLE_VISIBILITY: TgpuShaderStage[] = ['compute', 'fragment'];
const DEFAULT_READONLY_VISIBILITY: TgpuShaderStage[] = ['compute', 'vertex', 'fragment'];

class TgpuBindGroupLayoutImpl<
  Entries extends Record<string, TgpuLayoutEntry | null>,
> implements TgpuBindGroupLayout<Entries> {
  #index: number | undefined;

  readonly [$internal]: ResolvableObject[];
  readonly resourceType = 'bind-group-layout' as const;

  readonly $ = {} as {
    [K in keyof Entries]: InferLayoutEntry<Entries[K]>;
  };

  readonly entries: Entries;

  get [$gpuValueOf]() {
    return this.$;
  }

  constructor(entries: Entries) {
    this.entries = entries;
    this[$internal] = [];

    let idx = 0;

    for (const [key, entry] of Object.entries(entries)) {
      if (entry === null) {
        idx++;
        continue;
      }

      const membership: LayoutMembership = { layout: this, key, idx };
      let item: undefined | (ResolvableObject & { $: unknown }) = undefined;

      if ('uniform' in entry) {
        item = new TgpuLaidOutBufferImpl('uniform', entry.uniform, membership);
      }

      if ('storage' in entry) {
        const dataType = 'type' in entry.storage ? entry.storage : entry.storage(0);
        item = new TgpuLaidOutBufferImpl(entry.access ?? 'readonly', dataType, membership);
      }

      if ('texture' in entry) {
        item = new TgpuLaidOutTextureViewImpl(entry.texture, membership);
      }

      if ('storageTexture' in entry) {
        item = new TgpuLaidOutTextureViewImpl(entry.storageTexture, membership);
      }

      if ('externalTexture' in entry) {
        item = new TgpuExternalTextureImpl(entry.externalTexture, membership);
      }

      if ('sampler' in entry) {
        item = new TgpuLaidOutSamplerImpl(
          entry.sampler === 'comparison' ? wgslComparisonSampler() : wgslSampler(),
          membership,
        );
      }

      invariant(item !== undefined, 'Internal error, expected item to be defined');
      Object.defineProperty(this.$, key, {
        get: () => {
          return item.$;
        },
      });
      this[$internal].push(item);

      idx++;
    }
  }

  toString(): string {
    return `bindGroupLayout:${getName(this) ?? '<unnamed>'}`;
  }

  get index(): number | undefined {
    return this.#index;
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  $idx(index?: number): this {
    this.#index = index;
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
            visibility =
              visibility ??
              (entry.access === 'mutable'
                ? DEFAULT_MUTABLE_VISIBILITY
                : DEFAULT_READONLY_VISIBILITY);

            binding.buffer = {
              type:
                entry.access === 'mutable' ? ('storage' as const) : ('read-only-storage' as const),
            };
          } else if ('sampler' in entry) {
            visibility = visibility ?? DEFAULT_READONLY_VISIBILITY;

            binding.sampler = {
              type: entry.sampler,
            };
          } else if ('texture' in entry) {
            visibility = visibility ?? DEFAULT_READONLY_VISIBILITY;
            const { multisampled, dimension, bindingSampleType } = entry.texture;
            binding.texture = {
              sampleType: entry.sampleType ?? bindingSampleType[0],
              viewDimension: dimension,
              multisampled,
            } satisfies Required<GPUTextureBindingLayout>;
          } else if ('storageTexture' in entry) {
            visibility = visibility ?? DEFAULT_MUTABLE_VISIBILITY;
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
  Entries extends Record<string, TgpuLayoutEntry | null> = Record<string, TgpuLayoutEntry | null>,
> implements TgpuBindGroup<Entries> {
  readonly resourceType = 'bind-group' as const;
  readonly layout: TgpuBindGroupLayout<Entries>;
  readonly entries: ExtractBindGroupInputFromLayout<Entries>;

  constructor(
    layout: TgpuBindGroupLayout<Entries>,
    entries: ExtractBindGroupInputFromLayout<Entries>,
  ) {
    this.layout = layout;
    this.entries = entries;

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
            } else if (isUniformBinding(value)) {
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
            } else if (isMutableBinding(value) || isReadonlyBinding(value)) {
              // Types should guarantee that access is mutable if and only if the binding is mutable.
              invariant(
                (entry.access === 'mutable') === (value.resourceType === 'mutable'),
                'Invalid buffer access mode.',
              );
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
                (value as TgpuTexture & StorageFlag).createView(entry.storageTexture),
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

          throw new Error(`Malformed bind group entry: ${safeStringify(value)}`);
        })
        .filter((v): v is Exclude<typeof v, null> => v !== null),
    });

    return unwrapped;
  }
}
