import type {
  AnyHostShareableWgslData,
  AnyWgslData,
  BaseWgslData,
} from '../../data/wgslTypes';
import { type Storage, isUsableAsStorage } from '../../extension';
import { inGPUMode } from '../../gpuMode';
import type { Infer } from '../../shared/repr';
import type { LayoutMembership } from '../../tgpuBindGroupLayout';
import type {
  BindableBufferUsage,
  ResolutionCtx,
  TgpuResolvable,
} from '../../types';
import { type TgpuBuffer, type Uniform, isUsableAsUniform } from './buffer';

// ----------
// Public API
// ----------

export interface TgpuBufferUsage<
  TData extends BaseWgslData,
  TUsage extends BindableBufferUsage = BindableBufferUsage,
> extends TgpuResolvable {
  readonly resourceType: 'buffer-usage';
  readonly usage: TUsage;
  readonly '~repr': Infer<TData>;
  value: Infer<TData>;
}

export interface TgpuBufferUniform<TData extends BaseWgslData>
  extends TgpuBufferUsage<TData, 'uniform'> {
  readonly value: Infer<TData>;
}

export interface TgpuBufferReadonly<TData extends BaseWgslData>
  extends TgpuBufferUsage<TData, 'readonly'> {
  readonly value: Infer<TData>;
}

export interface TgpuBufferMutable<TData extends BaseWgslData>
  extends TgpuBufferUsage<TData, 'mutable'> {}

export function isBufferUsage<
  T extends
    | TgpuBufferUniform<BaseWgslData>
    | TgpuBufferReadonly<BaseWgslData>
    | TgpuBufferMutable<BaseWgslData>,
>(value: T | unknown): value is T {
  return (value as T)?.resourceType === 'buffer-usage';
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
  TData extends AnyHostShareableWgslData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>
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
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const { group, binding } = ctx.allocateFixedEntry(
      this.usage === 'uniform'
        ? { uniform: this.buffer.dataType }
        : { storage: this.buffer.dataType, access: this.usage },
      this.buffer,
    );
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var<${usage}> ${id}: ${ctx.resolve(this.buffer.dataType)};`,
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
    return this as Infer<TData>;
  }
}

export class TgpuLaidOutBufferImpl<
  TData extends BaseWgslData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>
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

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const group = ctx.allocateLayoutEntry(this._membership.layout);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var<${usage}> ${id}: ${ctx.resolve(this.dataType as AnyWgslData)};`,
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
    return this as Infer<TData>;
  }
}

const mutableUsageMap = new WeakMap<
  TgpuBuffer<AnyHostShareableWgslData>,
  TgpuFixedBufferImpl<AnyHostShareableWgslData, 'mutable'>
>();

export function asMutable<TData extends AnyHostShareableWgslData>(
  buffer: TgpuBuffer<TData> & Storage,
): TgpuBufferMutable<TData> {
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
  return usage as unknown as TgpuBufferMutable<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<AnyHostShareableWgslData>,
  TgpuFixedBufferImpl<AnyHostShareableWgslData, 'readonly'>
>();

export function asReadonly<TData extends AnyHostShareableWgslData>(
  buffer: TgpuBuffer<TData> & Storage,
): TgpuBufferReadonly<TData> {
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
  return usage as unknown as TgpuBufferReadonly<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<AnyHostShareableWgslData>,
  TgpuFixedBufferImpl<AnyHostShareableWgslData, 'uniform'>
>();

export function asUniform<TData extends AnyHostShareableWgslData>(
  buffer: TgpuBuffer<TData> & Uniform,
): TgpuBufferUniform<TData> {
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
  return usage as unknown as TgpuBufferUniform<TData>;
}
