import { BufferWriter, MaxValue } from 'typed-binary';
import { roundUp } from './mathUtils';
import { type AlignedSchema } from './std140';

export class NameRegistry {
  private lastUniqueId = 0;
  private names = new WeakMap<WGSLToken, string>();

  nameFor(token: WGSLToken) {
    let name = this.names.get(token);
    if (name === undefined) {
      name = `${token.sanitizedName}_${this.lastUniqueId++}`;
      this.names.set(token, name);
    }

    return name;
  }
}

export class StorageRegistry {
  public size = 0;
  public entries: WGSLStorage[] = [];
  public storageName = new WGSLToken('readonly_storage');
  private locationsMap = new WeakMap<WGSLStorage, number>();

  register(storage: WGSLStorage) {
    this.entries.push(storage);
    // aligning
    this.size = roundUp(this.size, storage.baseAlignment);
    this.locationsMap.set(storage, this.size);
    this.size += storage.size;
  }

  locationFor(storage: WGSLStorage) {
    return this.locationsMap.get(storage);
  }
}

export class WGSLRuntime {
  public readonly readonlyStorageBuffer?: GPUBuffer;

  constructor(
    public readonly device: GPUDevice,
    public readonly names: NameRegistry,
    public readonly readonlyStorage: StorageRegistry,
  ) {
    if (readonlyStorage.size > 0) {
      this.readonlyStorageBuffer = device.createBuffer({
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        size: roundUp(readonlyStorage.size, 16),
      });
    }
  }

  nameFor(token: WGSLToken) {
    return this.names.nameFor(token);
  }
}

export interface IResolutionCtx {
  addDependency(item: WGSLItem): void;
  readonlyStorageToken: WGSLToken;
  addReadonlyStorage(storage: WGSLStorage): void;
  nameFor(token: WGSLToken): string;
  resolve(item: WGSLSegment): string;
}

export class ResolutionCtx implements IResolutionCtx {
  public dependencies: WGSLItem[] = [];
  public readonlyStorageDeclarationIdx = 0;

  private memoizedResults = new WeakMap<WGSLItem, string>();

  constructor(
    public readonly names: NameRegistry,
    public readonly readonlyStorage: StorageRegistry,
    public readonly paramBindings: [WGSLParam, WGSLParamValue][],
    private readonly group: number,
  ) {}

  addDependency(item: WGSLItem) {
    this.resolve(item);
    addUnique(this.dependencies, item);
  }

  get readonlyStorageToken() {
    return this.readonlyStorage.storageName;
  }

  addReadonlyStorage(storage: WGSLStorage): void {
    this.readonlyStorage.register(storage);
    this.readonlyStorageDeclarationIdx = this.dependencies.length;
  }

  nameFor(token: WGSLToken): string {
    return this.names.nameFor(token);
  }

  resolve(item: WGSLSegment) {
    if (typeof item === 'string') {
      return item;
    }

    if (typeof item === 'number') {
      return String(item);
    }

    const memoizedResult = this.memoizedResults.get(item);
    if (memoizedResult !== undefined) {
      return memoizedResult;
    }

    const result = item.resolve(this);
    this.memoizedResults.set(item, result);
    return result;
  }
}

abstract class WGSLItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getChildren(ctx: IResolutionCtx): WGSLItem[] {
    return [];
  }

  abstract resolve(ctx: IResolutionCtx): string;
}

export class WGSLToken extends WGSLItem {
  constructor(public readonly description: string) {
    super();
  }

  get sanitizedName() {
    return this.description.replaceAll(/\s/g, '_');
  }

  resolve(ctx: IResolutionCtx): string {
    return ctx.nameFor(this);
  }
}

export type WGSLParamValue = string | number;
class WGSLParam extends WGSLItem {
  constructor(
    public readonly description: string,
    public readonly defaultValue?: WGSLParamValue,
  ) {
    super();
  }

  resolve(ctx: ResolutionCtx): string {
    const [, value = this.defaultValue] =
      ctx.paramBindings.find(([param]) => param === this) ?? [];
    if (!value) {
      throw new Error(`Missing parameter binding for '${this.description}'`);
    }
    return String(value);
  }
}

/**
 * Creates a constant is computed at shader initialization according
 * to the passed in expression.
 */
class WGSLConstant extends WGSLItem {
  public token: WGSLToken;

  constructor(
    private readonly expr: WGSLSegment,
    public readonly description: string,
  ) {
    super();
    this.token = new WGSLToken(description.replaceAll(/\s/g, '_'));
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`const ${this.token} = ${this.expr};`);

    return ctx.resolve(this.token);
  }
}

export interface WGSLStorage {
  readonly nameToken: WGSLToken;
  readonly typeExpr: WGSLSegment;
  readonly size: number;
  readonly baseAlignment: number;
}

class WGSLReadonlyStorage<T> extends WGSLItem implements WGSLStorage {
  public nameToken: WGSLToken;
  public size: number;
  public baseAlignment: number;

  constructor(
    description: string,
    public readonly typeExpr: WGSLSegment,
    private readonly typeSchema: AlignedSchema<T>,
  ) {
    super();

    this.nameToken = new WGSLToken(description);
    this.size = this.typeSchema.measure(MaxValue).size;
    this.baseAlignment = this.typeSchema.baseAlignment;
  }

  write(runtime: WGSLRuntime, data: T) {
    const gpuBuffer = runtime.readonlyStorageBuffer;

    if (!gpuBuffer) {
      console.warn(
        `Cannot write to the read-only storage buffer. Nothing is used in code.`,
      );
      return;
    }

    const bufferOffset = runtime.readonlyStorage.locationFor(this);

    if (bufferOffset === undefined) {
      console.warn(`Cannot write to a storage entry that is unused in code.`);
      return;
    }

    const hostBuffer = new ArrayBuffer(this.size);
    this.typeSchema.write(new BufferWriter(hostBuffer), data);
    runtime.device.queue.writeBuffer(
      gpuBuffer,
      bufferOffset,
      hostBuffer,
      0,
      this.size,
    );
  }

  resolve(ctx: IResolutionCtx): string {
    ctx.addReadonlyStorage(this);
    ctx.resolve(this.typeExpr); // Adding dependencies of this entry

    return (
      ctx.resolve(ctx.readonlyStorageToken) + '.' + ctx.resolve(this.nameToken)
    );
  }
}

class WGSLFunction extends WGSLItem {
  private nameToken: WGSLToken;

  constructor(
    prefix: string,
    private readonly body: WGSLCode,
  ) {
    super();

    this.nameToken = new WGSLToken(prefix);
  }

  resolve(ctx: ResolutionCtx): string {
    ctx.addDependency(code`fn ${this.nameToken}${this.body}`);

    return ctx.resolve(this.nameToken);
  }
}

function addUnique<T>(list: T[], value: T) {
  if (list.includes(value)) {
    return;
  }

  list.push(value);
}

export class WGSLCode extends WGSLItem {
  constructor(public readonly segments: WGSLSegment[]) {
    super();
  }

  getChildren(): WGSLItem[] {
    return this.segments.filter((s): s is WGSLItem => typeof s !== 'string');
  }

  resolve(ctx: ResolutionCtx) {
    let code = '';

    for (const s of this.segments) {
      switch (true) {
        case s instanceof WGSLItem:
          code += ctx.resolve(s);
          break;
        default:
          code += String(s);
      }
    }

    return code;
  }
}

export type WGSLSegment = string | number | WGSLItem;

function defined<T>(value: T): value is NonNullable<T> {
  return value !== undefined;
}

export function resolveProgram(
  device: GPUDevice,
  root: WGSLItem,
  options: {
    shaderStage: number;
    bindingGroup: number;
    params?: [WGSLParam, WGSLParamValue][];
  },
) {
  const names = new NameRegistry();
  const readonlyStorage = new StorageRegistry();
  const ctx = new ResolutionCtx(
    names,
    readonlyStorage,
    options.params ?? [],
    options.bindingGroup,
  );

  const codeString = ctx.resolve(root); // Resolving

  const runtime = new WGSLRuntime(device, names, readonlyStorage);

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      runtime.readonlyStorageBuffer
        ? {
            binding: 0,
            visibility: options.shaderStage,
            buffer: {
              type: 'read-only-storage' as const,
            },
          }
        : undefined,
    ].filter(defined),
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      runtime.readonlyStorageBuffer
        ? {
            binding: 0,
            resource: {
              buffer: runtime.readonlyStorageBuffer,
            },
          }
        : undefined,
    ].filter(defined),
  });

  const readonlyEntries = runtime.readonlyStorage.entries.map(
    (e) => code`${e.nameToken}: ${e.typeExpr},\n`,
  );

  const storageTypeToken = new WGSLToken('ReadonlyStorageType');

  const dependencies = ctx.dependencies.slice();

  if (readonlyEntries.length > 0) {
    dependencies.splice(
      ctx.readonlyStorageDeclarationIdx,
      0,
      code`
  struct ${storageTypeToken} {
    ${readonlyEntries}
  }

  @group(${options.bindingGroup}) @binding(0) var<storage, read> ${ctx.readonlyStorageToken}: ${storageTypeToken};
  `,
    );
  }

  return {
    runtime,
    bindGroupLayout,
    bindGroup,
    code:
      dependencies.map((d) => ctx.resolve(d)).join('\n') + '\n' + codeString,
  };
}

export function code(
  strings: TemplateStringsArray,
  ...params: (WGSLSegment | WGSLSegment[])[]
): WGSLCode {
  const segments: WGSLSegment[] = strings.flatMap((string, idx) => {
    if (idx >= params.length) {
      return [string];
    }

    const param = params[idx]!;
    return param instanceof Array ? [string, ...param] : [string, param];
  });

  return new WGSLCode(segments);
}

function fn(prefix: string = 'function') {
  return (
    strings: TemplateStringsArray,
    ...params: WGSLSegment[]
  ): WGSLFunction => {
    return new WGSLFunction(prefix, code(strings, ...params));
  };
}

function token(prefix: string): WGSLToken {
  return new WGSLToken(prefix);
}

function param(description: string, defaultValue?: WGSLParamValue): WGSLParam {
  return new WGSLParam(description, defaultValue);
}

function constant(expr: WGSLSegment, description?: string): WGSLConstant {
  return new WGSLConstant(expr, description ?? 'constant');
}

function readonlyStorage<T>(
  description: string,
  typeExpr: WGSLSegment,
  typeSchema: AlignedSchema<T>,
) {
  return new WGSLReadonlyStorage(description, typeExpr, typeSchema);
}

export default Object.assign(code, {
  code,
  fn,
  token,
  param,
  constant,
  readonlyStorage,
});
