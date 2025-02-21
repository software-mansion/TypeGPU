import type { AnyData } from '../../data/dataTypes';
import type { AnyWgslData, BaseData } from '../../data/wgslTypes';
import { type StorageFlag, isUsableAsStorage } from '../../extension';
import { inGPUMode } from '../../gpuMode';
import type { TgpuNamable } from '../../namable';
import type { Infer } from '../../shared/repr';
import type { LayoutMembership } from '../../tgpuBindGroupLayout';
import type {
  BindableBufferUsage,
  ResolutionCtx,
  SelfResolvable,
} from '../../types';
import { valueProxyHandler } from '../valueProxyUtils';
import type { TgpuBuffer, Uniform } from './buffer';

// ----------
// Public API
// ----------

export interface TgpuBufferUsage<
  TData extends BaseData = BaseData,
  TUsage extends BindableBufferUsage = BindableBufferUsage,
> {
  readonly resourceType: 'buffer-usage';
  readonly usage: TUsage;
  readonly '~repr': Infer<TData>;
  value: Infer<TData>;
}

export interface TgpuBufferUniform<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'uniform'> {
  readonly value: Infer<TData>;
}

export interface TgpuBufferReadonly<TData extends BaseData>
  extends TgpuBufferUsage<TData, 'readonly'> {
  readonly value: Infer<TData>;
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
): buffer is T & Uniform {
  return !!(buffer as unknown as Uniform).usableAsUniform;
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
    TgpuFixedBufferUsage<TData>
{
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TData>;
  public readonly resourceType = 'buffer-usage' as const;

  constructor(
    public readonly usage: TUsage,
    public readonly buffer: TgpuBuffer<TData>,
  ) {}

  get label() {
    return this.buffer.label;
  }

  $name(label: string) {
    this.buffer.$name(label);
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const { group, binding } = ctx.allocateFixedEntry(
      this.usage === 'uniform'
        ? { uniform: this.buffer.dataType }
        : { storage: this.buffer.dataType, access: this.usage },
      this.buffer,
    );
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var<${usage}> ${id}: ${ctx.resolve(
        this.buffer.dataType,
      )};`,
    );

    return id;
  }

  write(data: Infer<TData>) {
    this.buffer.write(data);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }

  get value(): Infer<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${this.label ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as Infer<TData>;
  }
}
export class TgpuLaidOutBufferImpl<
  TData extends BaseData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>, SelfResolvable
{
  /** Type-token, not available at runtime */
  public readonly '~repr'!: Infer<TData>;
  public readonly resourceType = 'buffer-usage' as const;

  constructor(
    public readonly usage: TUsage,
    public readonly dataType: TData,
    private readonly _membership: LayoutMembership,
  ) {}

  get label() {
    return this._membership.key;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const group = ctx.allocateLayoutEntry(this._membership.layout);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${
        this._membership.idx
      }) var<${usage}> ${id}: ${ctx.resolve(this.dataType as AnyWgslData)};`,
    );

    return id;
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }

  get value(): Infer<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }

    return new Proxy(
      {
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${this.label ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as Infer<TData>;
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
  return usage as unknown as TgpuBufferMutable<TData> &
    TgpuFixedBufferUsage<TData>;
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
  return usage as unknown as TgpuBufferReadonly<TData> &
    TgpuFixedBufferUsage<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<AnyWgslData>,
  TgpuFixedBufferImpl<AnyWgslData, 'uniform'>
>();

/**
 * @deprecated Use buffer.as('uniform') instead.
 */
export function asUniform<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & Uniform,
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
  return usage as unknown as TgpuBufferUniform<TData> &
    TgpuFixedBufferUsage<TData>;
}
