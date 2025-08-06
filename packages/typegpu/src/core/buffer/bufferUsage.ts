import type { AnyData } from '../../data/dataTypes.ts';
import type { AnyWgslData, BaseData } from '../../data/wgslTypes.ts';
import { isUsableAsStorage, type StorageFlag } from '../../extension.ts';
import { getExecMode, inCodegenMode, isInsideTgpuFn } from '../../execMode.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $repr,
  $wgslDataType,
} from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type {
  BindableBufferUsage,
  ResolutionCtx,
  SelfResolvable,
} from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import type { TgpuBuffer, UniformFlag } from './buffer.ts';
import { schemaCloneWrapper, schemaDefaultWrapper } from '../../data/utils.ts';
import { assertExhaustive } from '../../shared/utilityTypes.ts';
import { IllegalBufferAccessError } from '../../errors.ts';

// ----------
// Public API
// ----------

export interface TgpuBufferUsage<
  TData extends BaseData = BaseData,
  TUsage extends BindableBufferUsage = BindableBufferUsage,
> {
  readonly resourceType: 'buffer-usage';
  readonly usage: TUsage;
  readonly [$repr]: Infer<TData>;

  [$gpuValueOf](ctx: ResolutionCtx): InferGPU<TData>;
  value: InferGPU<TData>;
  $: InferGPU<TData>;

  readonly [$internal]: {
    readonly dataType: TData;
  };
}

export interface TgpuBufferUniform<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'uniform'> {
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

export interface TgpuBufferReadonly<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'readonly'> {
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

export interface TgpuFixedBufferUsage<TData extends BaseData>
  extends TgpuNamable {
  readonly buffer: TgpuBuffer<TData>;
}

export interface TgpuBufferMutable<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'mutable'> {}

export function isUsableAsUniform<T extends TgpuBuffer<AnyData>>(
  buffer: T,
): buffer is T & UniformFlag {
  return !!(buffer as unknown as UniformFlag).usableAsUniform;
}

// --------------
// Implementation
// --------------

const usageToVarTemplateMap: Record<BindableBufferUsage, string> = {
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

class TgpuFixedBufferImpl<
  TData extends AnyWgslData,
  TUsage extends BindableBufferUsage,
> implements
  TgpuBufferUsage<TData, TUsage>,
  SelfResolvable,
  TgpuFixedBufferUsage<TData> {
  /** Type-token, not available at runtime */
  declare public readonly [$repr]: Infer<TData>;
  public readonly resourceType = 'buffer-usage' as const;
  public readonly [$internal]: { readonly dataType: TData };
  public readonly [$getNameForward]: TgpuBuffer<TData>;

  constructor(
    public readonly usage: TUsage,
    public readonly buffer: TgpuBuffer<TData>,
  ) {
    this[$internal] = { dataType: buffer.dataType };
    this[$getNameForward] = buffer;
  }

  $name(label: string) {
    this.buffer.$name(label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const { group, binding } = ctx.allocateFixedEntry(
      this.usage === 'uniform'
        ? { uniform: this.buffer.dataType }
        : { storage: this.buffer.dataType, access: this.usage },
      this.buffer,
    );
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var<${usage}> ${id}: ${
        ctx.resolve(
          this.buffer.dataType,
        )
      };`,
    );

    return id;
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  [$gpuValueOf](): InferGPU<TData> {
    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$wgslDataType]: this.buffer.dataType,
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
  }

  get $(): InferGPU<TData> {
    const mode = getExecMode();
    const insideTgpuFn = isInsideTgpuFn();

    if (mode.type === 'normal') {
      throw new IllegalBufferAccessError(
        insideTgpuFn
          ? `Cannot access ${
            String(this.buffer)
          }. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
          : '.$ and .value are inaccessible during normal JS execution. Try `.read()`',
      );
    }

    if (mode.type === 'codegen') {
      return this[$gpuValueOf]();
    }

    if (mode.type === 'simulate') {
      if (!mode.buffers.has(this.buffer)) { // Not initialized yet
        mode.buffers.set(
          this.buffer,
          schemaCloneWrapper(this.buffer.dataType, this.buffer.initial) ??
            schemaDefaultWrapper(this.buffer.dataType),
        );
      }
      return mode.buffers.get(this.buffer) as InferGPU<TData>;
    }

    return assertExhaustive(mode, 'bufferUsage.ts#TgpuFixedBufferImpl/$');
  }

  get value(): InferGPU<TData> {
    return this.$;
  }

  set $(value: InferGPU<TData>) {
    const mode = getExecMode();
    const insideTgpuFn = isInsideTgpuFn();

    if (mode.type === 'normal') {
      throw new IllegalBufferAccessError(
        insideTgpuFn
          ? `Cannot access ${
            String(this.buffer)
          }. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
          : '.$ and .value are inaccessible during normal JS execution. Try `.write()`',
      );
    }

    if (mode.type === 'codegen') {
      // The WGSL generator handles buffer assignment, and does not defer to
      // whatever's being assigned to to generate the WGSL.
      throw new Error('Unreachable bufferUsage.ts#TgpuFixedBufferImpl/$');
    }

    if (mode.type === 'simulate') {
      mode.buffers.set(this.buffer, value as InferGPU<TData>);
      return;
    }

    assertExhaustive(mode, 'bufferUsage.ts#TgpuFixedBufferImpl/$');
  }

  set value(value: InferGPU<TData>) {
    this.$ = value;
  }
}

export class TgpuLaidOutBufferImpl<
  TData extends BaseData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>, SelfResolvable {
  /** Type-token, not available at runtime */
  declare public readonly [$repr]: Infer<TData>;
  public readonly resourceType = 'buffer-usage' as const;
  public readonly [$internal]: { readonly dataType: TData };

  constructor(
    public readonly usage: TUsage,
    public readonly dataType: TData,
    private readonly _membership: LayoutMembership,
  ) {
    this[$internal] = { dataType };
    setName(this, _membership.key);
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const group = ctx.allocateLayoutEntry(this._membership.layout);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var<${usage}> ${id}: ${
        ctx.resolve(this.dataType)
      };`,
    );

    return id;
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  [$gpuValueOf](): InferGPU<TData> {
    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$wgslDataType]: this.dataType,
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
  }

  get $(): InferGPU<TData> {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      'Direct access to buffer values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): InferGPU<TData> {
    return this.$;
  }
}

const mutableUsageMap = new WeakMap<
  TgpuBuffer<AnyWgslData>,
  TgpuFixedBufferImpl<AnyWgslData, 'mutable'>
>();

/**
 * @deprecated Use buffer.as('mutable') instead.
 */
export function asMutable<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & StorageFlag,
): TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asMutable, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = mutableUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuFixedBufferImpl('mutable', buffer);
    mutableUsageMap.set(buffer, usage);
  }
  return usage as unknown as
    & TgpuBufferMutable<TData>
    & TgpuFixedBufferUsage<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<AnyWgslData>,
  TgpuFixedBufferImpl<AnyWgslData, 'readonly'>
>();

/**
 * @deprecated Use buffer.as('readonly') instead.
 */
export function asReadonly<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & StorageFlag,
): TgpuBufferReadonly<TData> & TgpuFixedBufferUsage<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asReadonly, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = readonlyUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuFixedBufferImpl('readonly', buffer);
    readonlyUsageMap.set(buffer, usage);
  }
  return usage as unknown as
    & TgpuBufferReadonly<TData>
    & TgpuFixedBufferUsage<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<AnyWgslData>,
  TgpuFixedBufferImpl<AnyWgslData, 'uniform'>
>();

/**
 * @deprecated Use buffer.as('uniform') instead.
 */
export function asUniform<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & UniformFlag,
): TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData> {
  if (!isUsableAsUniform(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asUniform, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.`,
    );
  }

  let usage = uniformUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuFixedBufferImpl('uniform', buffer);
    uniformUsageMap.set(buffer, usage);
  }
  return usage as unknown as
    & TgpuBufferUniform<TData>
    & TgpuFixedBufferUsage<TData>;
}
