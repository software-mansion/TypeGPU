import { calculateOffsets, writeToArrayBuffer } from '../../data/dataIO.ts';
import { isDisarray, isUnstruct, undecorate, type AnyData } from '../../data/dataTypes.ts';
import { navigateSchema } from '../../data/offsetUtils.ts';
import { schemasEqualStructurally } from '../../data/schemasEqual.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { isWgslArray, type AnyWgslData, type BaseData } from '../../data/wgslTypes.ts';
import type { StorageFlag } from '../../extension.ts';
import { roundUp } from '../../mathUtils.ts';
import { getName, setName, type TgpuNamable } from '../../shared/meta.ts';
import type { Infer, InferInput, InferPatch, MemIdentity } from '../../shared/repr.ts';
import type { TgpuSoul } from '../../shared/soul.ts';
import { $internal, $soul } from '../../shared/symbols.ts';
import type { TgpuCommandEncoder } from '../commandEncoder/commandEncoder.ts';
import type {
  BufferWriteOptions,
  IndexFlag,
  IndirectFlag,
  TgpuBuffer,
  UniformFlag,
  UsageTypeToBufferBinding,
  VertexFlag,
  ViewUsages,
} from './buffer.ts';
import { mutable, readonly, uniform } from './bufferBinding.ts';

// ----------
// Public API
// ----------

export interface TgpuBufferRegionSoul<
  TData extends BaseData = BaseData,
> extends TgpuSoul<'buffer-region'> {
  readonly buffer: TgpuBuffer<BaseData>;
  readonly dataType: TData;
  readonly offset: number;
}

interface UsageFlagCarrier {
  readonly usableAsUniform: boolean;
  readonly usableAsStorage: boolean;
  readonly usableAsVertex: boolean;
  readonly usableAsIndex: boolean;
  readonly usableAsIndirect: boolean;
}

/**
 * The usage flags a region takes from the buffer it is part of.
 */
export type InheritedUsageFlags<TBuffer extends UsageFlagCarrier> =
  (boolean extends TBuffer['usableAsUniform'] ? unknown : UniformFlag) &
    (boolean extends TBuffer['usableAsStorage'] ? unknown : StorageFlag) &
    (boolean extends TBuffer['usableAsVertex'] ? unknown : VertexFlag) &
    (boolean extends TBuffer['usableAsIndex'] ? unknown : IndexFlag) &
    (boolean extends TBuffer['usableAsIndirect'] ? unknown : IndirectFlag);

/**
 * Selects where a region starts in its buffer, without an accessor: the
 * caller states that the bytes there hold data laid out as the region's schema.
 */
export interface BufferRegionOptions {
  /**
   * Where the region starts, in bytes from the start of the buffer.
   * @default 0
   */
  offsetBytes?: number;
}

/**
 * A typed range of bytes in a {@link TgpuBuffer}, created with `buffer.region(...)`.
 *
 * A region reads, writes, clears and copies only its own bytes, and can be used
 * wherever a buffer can: in bind groups, as `.as('uniform' | 'readonly' | 'mutable')`
 * bindings, as vertex, index and indirect buffers. A region takes its usage
 * flags from its buffer.
 *
 * Reading, writing and copying put no requirement on the region's offset beyond the
 * 4-byte granularity of WebGPU copies. Binding a region as a uniform or storage buffer
 * requires its offset to be a multiple of the device's `minUniformBufferOffsetAlignment`
 * or `minStorageBufferOffsetAlignment` (at most 256 bytes).
 */
export interface TgpuBufferRegion<TData extends BaseData> extends TgpuNamable, UsageFlagCarrier {
  readonly [$internal]: true;
  readonly [$soul]: TgpuBufferRegionSoul<TData>;
  readonly resourceType: 'buffer-region';
  readonly dataType: TData;
  /** The buffer this region is part of. */
  readonly buffer: TgpuBuffer<BaseData>;
  /** Where the region starts, in bytes from the start of {@link buffer}. */
  readonly offset: number;
  /** The size of the region in bytes, `sizeOf(dataType)`. */
  readonly size: number;
  readonly destroyed: boolean;

  as<T extends ViewUsages<this>>(
    usage: T,
  ): UsageTypeToBufferBinding<TData, TgpuBufferRegion<TData>>[T];

  write(data: InferInput<TData>, options?: BufferWriteOptions): void;
  /** Copies bytes laid out as the schema, from `startOffset` (0 by default) */
  write(data: ArrayBuffer | ArrayBufferView, options?: BufferWriteOptions): void;
  patch(data: InferPatch<TData>): void;
  clear(encoder?: TgpuCommandEncoder): void;
  copyFrom(
    source: TgpuBuffer<MemIdentity<TData>> | TgpuBufferRegion<MemIdentity<TData>>,
    encoder?: TgpuCommandEncoder,
  ): void;
  read(): Promise<Infer<TData>>;
  toString(): string;
}

export function isBufferRegion<TData extends BaseData = BaseData>(
  value: unknown,
): value is TgpuBufferRegion<TData> {
  return (value as TgpuBufferRegion<TData> | undefined)?.resourceType === 'buffer-region';
}

// --------------
// Implementation
// --------------

function sameMemory(a: BaseData, b: BaseData): boolean {
  return schemasEqualStructurally(undecorate(a) as AnyData, undecorate(b) as AnyData);
}

/**
 * Whether a region of `regionSchema` can start at an element of `elementSchema`: the same type,
 * an array covering a prefix of the element's array, or an array running over the `elements`
 * array elements that start at it.
 */
function fitsElement(
  regionSchema: BaseData,
  elementSchema: BaseData,
  elements: number | undefined,
): boolean {
  if (sameMemory(regionSchema, elementSchema)) {
    return true;
  }
  const region = undecorate(regionSchema);
  if (!isWgslArray(region)) {
    return false;
  }
  const element = undecorate(elementSchema);
  const isPrefix =
    isWgslArray(element) &&
    region.elementCount <= element.elementCount &&
    sameMemory(region.elementType, element.elementType);
  const isRun =
    elements !== undefined &&
    region.elementCount <= elements &&
    sameMemory(region.elementType, element);
  return isPrefix || isRun;
}

export function INTERNAL_createBufferRegion<TRegion extends AnyWgslData>(
  buffer: TgpuBuffer<BaseData>,
  schema: TRegion,
  accessorOrOptions: ((data: never) => unknown) | BufferRegionOptions | undefined,
): TgpuBufferRegion<TRegion> {
  if (typeof accessorOrOptions === 'function') {
    const parentSchema = undecorate(buffer.dataType);
    if (isUnstruct(parentSchema) || isDisarray(parentSchema)) {
      throw new Error(
        `Cannot navigate the loose schema of buffer '${getName(buffer) ?? '<unnamed>'}' with an accessor. Pass { offsetBytes } instead.`,
      );
    }
    const element = navigateSchema(
      buffer.dataType,
      accessorOrOptions as (data: unknown) => unknown,
    );
    if (!fitsElement(schema, element.schema, element.elements)) {
      const run =
        element.elements !== undefined && isWgslArray(undecorate(schema))
          ? ` (${element.elements} elements of its array start at it)`
          : '';
      throw new Error(
        `Cannot create a region of type '${schema}' over an element of type '${element.schema}'${run}. To reinterpret the memory, pass { offsetBytes: ${element.offset} } instead of an accessor.`,
      );
    }
    return new TgpuBufferRegionImpl(buffer, schema, element.offset);
  }

  const offset = accessorOrOptions?.offsetBytes ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(`A buffer region's offset must be a non-negative integer, got ${offset}.`);
  }

  const regionSize = sizeOf(schema);
  const bufferSize = sizeOf(buffer.dataType);
  if (offset + regionSize > bufferSize) {
    throw new Error(
      `A region of type '${schema}' (${regionSize} bytes) at offset ${offset} does not fit in buffer '${getName(buffer) ?? '<unnamed>'}' (${bufferSize} bytes).`,
    );
  }

  return new TgpuBufferRegionImpl(buffer, schema, offset);
}

export function INTERNAL_restoreBufferRegion(
  soul: TgpuBufferRegionSoul,
): TgpuBufferRegion<BaseData> {
  return new TgpuBufferRegionImpl(soul.buffer, soul.dataType, soul.offset);
}

/**
 * Describes the range a buffer or a region binds as, for `GPUBindGroupEntry.resource`.
 * Regions bound as uniform or storage buffers have their offset validated against the
 * device's limits, since WebGPU only reports a misaligned offset asynchronously, without
 * naming the resource.
 */
export function bufferBindingOf(
  target: TgpuBuffer<BaseData> | TgpuBufferRegion<BaseData>,
  usage: 'uniform' | 'storage',
): GPUBufferBinding {
  if (!isBufferRegion(target)) {
    return { buffer: target.buffer };
  }

  const parent = target.buffer;
  const limits = parent[$soul].device.limits;
  const [limitName, alignment] =
    usage === 'uniform'
      ? (['minUniformBufferOffsetAlignment', limits?.minUniformBufferOffsetAlignment] as const)
      : (['minStorageBufferOffsetAlignment', limits?.minStorageBufferOffsetAlignment] as const);
  // 256 is the largest alignment a device may require
  const required = alignment ?? 256;

  if (target.offset % required !== 0) {
    throw new Error(
      `Cannot bind region '${getName(target) ?? '<unnamed>'}' of buffer '${getName(parent) ?? '<unnamed>'}' as a ${usage} buffer: its offset (${target.offset} bytes) is not a multiple of ${limitName} (${required} bytes on this device). Place the region at a multiple of ${required} bytes (e.g. wrap its struct member in d.align(${required}, ...)), or bind the whole buffer and read the region through it.`,
    );
  }

  // Storage bindings have to be a multiple of 4 bytes long
  const size = Math.min(
    roundUp(target.size, 4),
    roundUp(sizeOf(parent.dataType), 4) - target.offset,
  );
  return { buffer: parent.buffer, offset: target.offset, size };
}

const usageToBindingConstructor = { uniform, mutable, readonly };

class TgpuBufferRegionImpl<TData extends BaseData> implements TgpuBufferRegion<TData> {
  readonly [$internal] = true;
  readonly [$soul]: TgpuBufferRegionSoul<TData>;
  readonly resourceType = 'buffer-region';
  readonly size: number;

  #scratch: ArrayBuffer | undefined;

  constructor(buffer: TgpuBuffer<BaseData>, dataType: TData, offset: number) {
    this[$soul] = {
      type: 'buffer-region',
      buffer,
      dataType,
      offset,
      label: undefined,
    };
    this.size = sizeOf(dataType);
  }

  get dataType(): TData {
    return this[$soul].dataType;
  }

  get buffer(): TgpuBuffer<BaseData> {
    return this[$soul].buffer;
  }

  get offset(): number {
    return this[$soul].offset;
  }

  get destroyed(): boolean {
    return this.buffer.destroyed;
  }

  get usableAsUniform(): boolean {
    return this.buffer.usableAsUniform;
  }

  get usableAsStorage(): boolean {
    return this.buffer.usableAsStorage;
  }

  get usableAsVertex(): boolean {
    return this.buffer.usableAsVertex;
  }

  get usableAsIndex(): boolean {
    return this.buffer.usableAsIndex;
  }

  get usableAsIndirect(): boolean {
    return this.buffer.usableAsIndirect;
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  as<T extends ViewUsages<this>>(
    usage: T,
  ): UsageTypeToBufferBinding<TData, TgpuBufferRegion<TData>>[T] {
    return usageToBindingConstructor[usage](this as never) as UsageTypeToBufferBinding<
      TData,
      TgpuBufferRegion<TData>
    >[T];
  }

  write(data: InferInput<TData>, options?: BufferWriteOptions): void;
  write(data: ArrayBuffer | ArrayBufferView, options?: BufferWriteOptions): void;
  write(
    data: InferInput<TData> | ArrayBuffer | ArrayBufferView,
    options?: BufferWriteOptions,
  ): void {
    const { startOffset, endOffset } = calculateOffsets(options, this.dataType, data);
    const range = { startOffset: this.offset + startOffset, endOffset: this.offset + endOffset };
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      // Raw bytes need no layout, so they go to the buffer as they are
      this.buffer.write(data, range);
      return;
    }
    // Serialized on its own first, since the layout of the schema starts at the region's offset
    const scratch = (this.#scratch ??= new ArrayBuffer(roundUp(this.size, 4)));
    writeToArrayBuffer(scratch, this.dataType, data, options);
    this.buffer.write(new Uint8Array(scratch, startOffset, endOffset - startOffset), range);
  }

  patch(data: InferPatch<TData>): void {
    this.buffer[$internal].region.patch(this.offset, this.dataType, data);
  }

  clear(encoder?: TgpuCommandEncoder): void {
    this.buffer[$internal].region.clear(this.offset, this.size, encoder);
  }

  copyFrom(
    source: TgpuBuffer<MemIdentity<TData>> | TgpuBufferRegion<MemIdentity<TData>>,
    encoder?: TgpuCommandEncoder,
  ): void {
    this.buffer[$internal].region.copy(this.offset, this.size, source, encoder);
  }

  read(): Promise<Infer<TData>> {
    return this.buffer[$internal].region.read(this.offset, this.dataType) as Promise<Infer<TData>>;
  }

  toString(): string {
    return `bufferRegion:${getName(this) ?? '<unnamed>'}`;
  }
}
