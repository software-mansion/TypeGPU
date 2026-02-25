import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import { type AnyWgslData, type BaseData, isNaturallyEphemeral } from '../../data/wgslTypes.ts';
import { IllegalBufferAccessError } from '../../errors.ts';
import { getExecMode, inCodegenMode, isInsideTgpuFn } from '../../execMode.ts';
import { isUsableAsStorage, type StorageFlag } from '../../extension.ts';
import type { TgpuNamable } from '../../shared/meta.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { Infer, InferGPU } from '../../shared/repr.ts';
import {
  $getNameForward,
  $gpuValueOf,
  $internal,
  $ownSnippet,
  $repr,
  $resolve,
} from '../../shared/symbols.ts';
import { assertExhaustive } from '../../shared/utilityTypes.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { BindableBufferUsage, ResolutionCtx, SelfResolvable } from '../../types.ts';
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

  readonly [$gpuValueOf]: InferGPU<TData>;
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  value: InferGPU<TData>;
  $: InferGPU<TData>;

  readonly [$internal]: {
    readonly dataType: TData;
  };
}

export interface TgpuBufferUniform<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'uniform'
> {
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

export interface TgpuBufferReadonly<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'readonly'
> {
  /**
   * @deprecated Use `.$` instead, works the same way.
   */
  readonly value: InferGPU<TData>;
  readonly $: InferGPU<TData>;
}

export interface TgpuFixedBufferUsage<TData extends BaseData> extends TgpuNamable {
  readonly buffer: TgpuBuffer<TData>;
}

export interface TgpuBufferMutable<TData extends BaseData> extends TgpuBufferUsage<
  TData,
  'mutable'
> {}

export function isUsableAsUniform<T extends TgpuBuffer<BaseData>>(
  buffer: T,
): buffer is T & UniformFlag {
  return !!buffer.usableAsUniform;
}

// --------------
// Implementation
// --------------

const usageToVarTemplateMap: Record<BindableBufferUsage, string> = {
  uniform: 'uniform',
  mutable: 'storage, read_write',
  readonly: 'storage, read',
};

class TgpuFixedBufferImpl<TData extends BaseData, TUsage extends BindableBufferUsage>
  implements TgpuBufferUsage<TData, TUsage>, SelfResolvable, TgpuFixedBufferUsage<TData>
{
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;
  readonly resourceType = 'buffer-usage' as const;
  readonly [$internal]: { readonly dataType: TData };
  readonly [$getNameForward]: TgpuBuffer<TData>;

  constructor(
    public readonly usage: TUsage,
    public readonly buffer: TgpuBuffer<TData>,
  ) {
    this[$internal] = { dataType: buffer.dataType };
    this[$getNameForward] = buffer;
  }

  $name(label: string) {
    setName(this, label);
    return this;
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const dataType = this.buffer.dataType;
    const id = ctx.getUniqueName(this);
    const { group, binding } = ctx.allocateFixedEntry(
      this.usage === 'uniform' ? { uniform: dataType } : { storage: dataType, access: this.usage },
      this.buffer,
    );
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var<${usage}> ${id}: ${ctx.resolve(dataType).value};`,
    );

    return snip(id, dataType, isNaturallyEphemeral(dataType) ? 'runtime' : this.usage);
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  get [$gpuValueOf](): InferGPU<TData> {
    const dataType = this.buffer.dataType;
    const usage = this.usage;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, dataType, isNaturallyEphemeral(dataType) ? 'runtime' : usage);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.usage}:${getName(this) ?? '<unnamed>'}.$`,
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
          ? `Cannot access ${String(
              this.buffer,
            )}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
          : '.$ is inaccessible during normal JS execution. Try `.read()`',
      );
    }

    if (mode.type === 'codegen') {
      return this[$gpuValueOf];
    }

    if (mode.type === 'simulate') {
      if (!mode.buffers.has(this.buffer)) {
        // Not initialized yet
        mode.buffers.set(this.buffer, schemaCallWrapper(this.buffer.dataType, this.buffer.initial));
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
          ? `Cannot access ${String(
              this.buffer,
            )}. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation`
          : '.$ is inaccessible during normal JS execution. Try `.write()`',
      );
    }

    if (mode.type === 'codegen') {
      // The WGSL generator handles buffer assignment, and does not defer to
      // whatever's being assigned to to generate the WGSL.
      throw new Error('Unreachable bufferUsage.ts#TgpuFixedBufferImpl/$');
    }

    if (mode.type === 'simulate') {
      mode.buffers.set(this.buffer, value);
      return;
    }

    assertExhaustive(mode, 'bufferUsage.ts#TgpuFixedBufferImpl/$');
  }

  set value(value: InferGPU<TData>) {
    this.$ = value;
  }
}

export class TgpuLaidOutBufferImpl<TData extends BaseData, TUsage extends BindableBufferUsage>
  implements TgpuBufferUsage<TData, TUsage>, SelfResolvable
{
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;
  readonly [$internal]: { readonly dataType: TData };
  readonly resourceType = 'buffer-usage' as const;
  readonly #membership: LayoutMembership;

  constructor(
    public readonly usage: TUsage,
    public readonly dataType: TData,
    membership: LayoutMembership,
  ) {
    this[$internal] = { dataType };
    this.#membership = membership;
    setName(this, membership.key);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
    const group = ctx.allocateLayoutEntry(this.#membership.layout);
    const usage = usageToVarTemplateMap[this.usage];

    ctx.addDeclaration(
      `@group(${group}) @binding(${this.#membership.idx}) var<${usage}> ${id}: ${
        ctx.resolve(this.dataType).value
      };`,
    );

    return snip(id, this.dataType, isNaturallyEphemeral(this.dataType) ? 'runtime' : this.usage);
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
  }

  get [$gpuValueOf](): InferGPU<TData> {
    const schema = this.dataType;
    const usage = this.usage;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, isNaturallyEphemeral(schema) ? 'runtime' : usage);
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `${this.usage}:${getName(this) ?? '<unnamed>'}.$`,
      },
      valueProxyHandler,
    ) as InferGPU<TData>;
  }

  get $(): InferGPU<TData> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
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
  TgpuBuffer<BaseData>,
  TgpuFixedBufferImpl<BaseData, 'mutable'>
>();

export function mutable<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & StorageFlag,
): TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot call as('mutable') on ${buffer}, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = mutableUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuFixedBufferImpl('mutable', buffer);
    mutableUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferMutable<TData> & TgpuFixedBufferUsage<TData>;
}

const readonlyUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuFixedBufferImpl<BaseData, 'readonly'>
>();

export function readonly<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & StorageFlag,
): TgpuBufferReadonly<TData> & TgpuFixedBufferUsage<TData> {
  if (!isUsableAsStorage(buffer)) {
    throw new Error(
      `Cannot call as('readonly') on ${buffer}, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.`,
    );
  }

  let usage = readonlyUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuFixedBufferImpl('readonly', buffer);
    readonlyUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferReadonly<TData> & TgpuFixedBufferUsage<TData>;
}

const uniformUsageMap = new WeakMap<
  TgpuBuffer<BaseData>,
  TgpuFixedBufferImpl<BaseData, 'uniform'>
>();

export function uniform<TData extends AnyWgslData>(
  buffer: TgpuBuffer<TData> & UniformFlag,
): TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData> {
  if (!isUsableAsUniform(buffer)) {
    throw new Error(
      `Cannot call as('uniform') on ${buffer}, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.`,
    );
  }

  let usage = uniformUsageMap.get(buffer);
  if (!usage) {
    usage = new TgpuFixedBufferImpl('uniform', buffer);
    uniformUsageMap.set(buffer, usage);
  }
  return usage as unknown as TgpuBufferUniform<TData> & TgpuFixedBufferUsage<TData>;
}
