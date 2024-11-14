import type { Unwrap } from 'typed-binary';
import { type Storage, isUsableAsStorage } from '../../extension';
import { inGPUMode } from '../../gpuMode';
import type { TgpuBindGroupLayout } from '../../tgpuBindGroupLayout';
import { code } from '../../tgpuCode';
import { identifier } from '../../tgpuIdentifier';
import type {
  AnyTgpuData,
  BindableBufferUsage,
  ResolutionCtx,
} from '../../types';
import type { TgpuLaidOut } from '../bindGroup/laidOut';
import { type TgpuBuffer, type Uniform, isUsableAsUniform } from './buffer';

// ----------
// Public API
// ----------

export interface TgpuBufferUniform<TData extends AnyTgpuData> {
  readonly resourceType: 'buffer-usage';
  readonly usage: 'uniform';
  readonly buffer: TgpuBuffer<TData> | undefined;
  readonly layout: TgpuBindGroupLayout | undefined;
  readonly value: Unwrap<TData>;
}

export interface TgpuBufferReadonly<TData extends AnyTgpuData> {
  readonly resourceType: 'buffer-usage';
  readonly usage: 'readonly';
  readonly buffer: TgpuBuffer<TData> | undefined;
  readonly layout: TgpuBindGroupLayout | undefined;
  readonly value: Unwrap<TData>;
}

export interface TgpuBufferMutable<TData extends AnyTgpuData> {
  readonly resourceType: 'buffer-usage';
  readonly usage: 'mutable';
  readonly buffer: TgpuBuffer<TData> | undefined;
  readonly layout: TgpuBindGroupLayout | undefined;
  value: Unwrap<TData>;
}

export interface TgpuBufferUsage<
  TData extends AnyTgpuData,
  TUsage extends BindableBufferUsage = BindableBufferUsage,
> {
  readonly resourceType: 'buffer-usage';
  readonly usage: TUsage;
  value: Unwrap<TData>;
}

export function isBufferUsage<
  T extends
    | TgpuBufferUniform<AnyTgpuData>
    | TgpuBufferReadonly<AnyTgpuData>
    | TgpuBufferMutable<AnyTgpuData>,
>(value: T | unknown): value is T {
  return !!value && (value as T).resourceType === 'buffer-usage';
}

// --------------
// Implementation
// --------------

const usageToVarTemplateMap: Record<BindableBufferUsage, string> = {
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

class TgpuBindableBufferImpl<
  TData extends AnyTgpuData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>
{
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
    const ident = identifier().$name(this.label);
    const { group, binding } = ctx.registerBindable(this);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      code`@group(${group}) @binding(${binding}) var<${usage}> ${ident}: ${this.buffer.dataType};`,
    );

    return ctx.resolve(ident);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }

  get value(): Unwrap<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }
    return this as Unwrap<TData>;
  }
}

export class TgpuLaidOutBufferImpl<
  TData extends AnyTgpuData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>, TgpuLaidOut
{
  public readonly resourceType = 'buffer-usage' as const;

  constructor(
    public readonly usage: TUsage,
    public readonly dataType: TData,
    public readonly layout: TgpuBindGroupLayout,
    public readonly layoutKey: string,
    public readonly layoutIdx: number,
  ) {}

  get label() {
    return this.layoutKey;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this.label);
    const group = ctx.registerLaidOut(this);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      code`@group(${group}) @binding(${this.layoutIdx}) var<${usage}> ${ident}: ${this.dataType};`,
    );

    return ctx.resolve(ident);
  }

  toString(): string {
    return `${this.usage}:${this.label ?? '<unnamed>'}`;
  }

  get value(): Unwrap<TData> {
    if (!inGPUMode()) {
      throw new Error(`Cannot access buffer's value directly in JS.`);
    }
    return this as Unwrap<TData>;
  }
}

const mutableUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  TgpuBindableBufferImpl<AnyTgpuData, 'mutable'>
>();

export function asMutable<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Storage,
): TgpuBufferMutable<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asMutable, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = mutableUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBindableBufferImpl('mutable', buffer);
    mutableUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferMutable<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  TgpuBindableBufferImpl<AnyTgpuData, 'readonly'>
>();

export function asReadonly<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Storage,
): TgpuBufferReadonly<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asReadonly, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = readonlyUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBindableBufferImpl('readonly', buffer);
    readonlyUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferReadonly<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<AnyTgpuData>,
  TgpuBindableBufferImpl<AnyTgpuData, 'uniform'>
>();

export function asUniform<TData extends AnyTgpuData>(
  buffer: TgpuBuffer<TData> & Uniform,
): TgpuBufferUniform<TData> {
  if (!isUsableAsUniform(buffer)) {
    throw new Error(
      `Cannot pass ${buffer} to asUniform, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.`,
    );
  }

  let usage = uniformUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuBindableBufferImpl('uniform', buffer);
    uniformUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferUniform<TData>;
}
