import type { AnyData } from '../../data/dataTypes.ts';
import { schemaCallWrapper } from '../../data/schemaCallWrapper.ts';
import { snip, type Snippet } from '../../data/snippet.ts';
import type { AnyWgslData, BaseData } from '../../data/wgslTypes.ts';
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
  $repr,
  $resolve,
  $runtimeResource,
} from '../../shared/symbols.ts';
import { assertExhaustive } from '../../shared/utilityTypes.ts';
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

  readonly [$gpuValueOf]: InferGPU<TData>;
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
  TgpuFixedBufferUsage<TData>,
  SelfResolvable {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;
  readonly resourceType = 'buffer-usage' as const;
  readonly [$internal]: { readonly dataType: TData };
  readonly [$getNameForward]: TgpuBuffer<TData>;
  readonly [$gpuValueOf]: InferGPU<TData>;

  constructor(
    public readonly usage: TUsage,
    public readonly buffer: TgpuBuffer<TData>,
  ) {
    this[$internal] = { dataType: buffer.dataType };
    this[$getNameForward] = buffer;

    this[$gpuValueOf] = snip(
      new Proxy({
        [$internal]: true,
        [$runtimeResource]: true,
        resourceType: 'access-proxy',

        [$resolve]: (ctx: ResolutionCtx) => {
          const id = ctx.names.makeUnique(getName(this));
          const { group, binding } = ctx.allocateFixedEntry(
            this.usage === 'uniform'
              ? { uniform: buffer.dataType }
              : { storage: buffer.dataType, access: this.usage },
            buffer,
          );
          const usageTemplate = usageToVarTemplateMap[usage];

          ctx.addDeclaration(
            `@group(${group}) @binding(${binding}) var<${usageTemplate}> ${id}: ${
              ctx.resolve(buffer.dataType)
            };`,
          );

          return id;
        },
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      }, valueProxyHandler(buffer.dataType)),
      buffer.dataType,
    ) as InferGPU<TData>;
  }

  $name(label: string) {
    this.buffer.$name(label);
    return this;
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
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
      return this[$gpuValueOf];
    }

    if (mode.type === 'simulate') {
      if (!mode.buffers.has(this.buffer)) { // Not initialized yet
        mode.buffers.set(
          this.buffer,
          schemaCallWrapper(this.buffer.dataType, this.buffer.initial),
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

  [$resolve](ctx: ResolutionCtx): string {
    const snippet = this[$gpuValueOf] as Snippet;
    return ctx.resolve(snippet.value, snippet.dataType);
  }
}

export class TgpuLaidOutBufferImpl<
  TData extends BaseData,
  TUsage extends BindableBufferUsage,
> implements TgpuBufferUsage<TData, TUsage>, SelfResolvable {
  /** Type-token, not available at runtime */
  declare readonly [$repr]: Infer<TData>;
  readonly resourceType = 'buffer-usage' as const;
  readonly [$internal]: { readonly dataType: TData };
  readonly [$gpuValueOf]: InferGPU<TData>;

  constructor(
    public readonly usage: TUsage,
    public readonly dataType: TData,
    private readonly _membership: LayoutMembership,
  ) {
    this[$internal] = { dataType };
    setName(this, _membership.key);

    const schema = dataType as unknown as AnyData;

    this[$gpuValueOf] = snip(
      new Proxy({
        [$internal]: true,
        [$runtimeResource]: true,
        resourceType: 'access-proxy',

        [$resolve]: (ctx: ResolutionCtx) => {
          const id = ctx.names.makeUnique(getName(this));
          const group = ctx.allocateLayoutEntry(_membership.layout);
          const usageTemplate = usageToVarTemplateMap[usage];

          ctx.addDeclaration(
            `@group(${group}) @binding(${_membership.idx}) var<${usageTemplate}> ${id}: ${
              ctx.resolve(
                dataType,
              )
            };`,
          );

          return id;
        },
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      }, valueProxyHandler(schema)),
      schema,
    ) as InferGPU<TData>;
  }

  toString(): string {
    return `${this.usage}:${getName(this) ?? '<unnamed>'}`;
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

  [$resolve](ctx: ResolutionCtx): string {
    const snippet = this[$gpuValueOf] as Snippet;
    return ctx.resolve(snippet.value, snippet.dataType);
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
