import type { TgpuNamable } from 'src/name.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import type { AnyWgslData, BaseData } from '../../data/wgslTypes.ts';
import { isUsableAsStorage, type StorageFlag } from '../../extension.ts';
import { inGPUMode } from '../../gpuMode.ts';
import { getName } from '../../name.ts';
import { $repr, type Infer, type InferGPU } from '../../shared/repr.ts';
import { $internal, $labelForward } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type {
  BindableBufferUsage,
  ResolutionCtx,
  SelfResolvable,
} from '../../types.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import type { TgpuBuffer, UniformFlag } from './buffer.ts';

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
  value: InferGPU<TData>;

  readonly [$internal]: {
    readonly dataType: TData;
  };
}

export interface TgpuBufferUniform<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'uniform'> {
  readonly value: InferGPU<TData>;
}

export interface TgpuBufferReadonly<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'readonly'> {
  readonly value: InferGPU<TData>;
}

export interface TgpuFixedBufferUsage<TData extends BaseData>
  extends TgpuNamable {
  readonly buffer: TgpuBuffer<TData>;
  write(data: Infer<TData>): void;
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
  public readonly [$labelForward]: TgpuBuffer<TData>;

  constructor(
    public readonly usage: TUsage,
    public readonly buffer: TgpuBuffer<TData>,
  ) {
    this[$internal] = { dataType: buffer.dataType };
    this[$labelForward] = buffer;
  }

  $name(label: string) {
    this.buffer.$name(label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this.buffer));
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

  write(data: Infer<TData>) {
    this.buffer.write(data);
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  get value(): InferGPU<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$internal]: {
          dataType: this.buffer.dataType,
        },
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
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
  public readonly [$labelForward]: LayoutMembership;

  constructor(
    public readonly usage: TUsage,
    public readonly dataType: TData,
    private readonly _membership: LayoutMembership,
  ) {
    this[$internal] = { dataType };
    this[$labelForward] = _membership;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const group = ctx.allocateLayoutEntry(this._membership.layout);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var<${usage}> ${id}: ${
        ctx.resolve(this.dataType as AnyWgslData)
      };`,
    );

    return id;
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  get value(): InferGPU<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
        [$internal]: {
          dataType: this.dataType,
        },
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
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
